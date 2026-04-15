/**
 * KSeF API rate-limit helpers.
 *
 * KSeF enforces a rolling limit of 20 requests per hour and returns HTTP 429
 * with the retry delay embedded in a Polish-language response body, e.g.:
 *
 *   "Spróbuj ponownie po 5 minutach i 51 sekundach."
 *
 * This module provides a fetch wrapper that transparently waits and retries
 * when the rate limit is hit.
 */

// ── Response body parsing ──

const RETRY_MINS_SECS = /po\s+(\d+)\s+minut\w*\s+i\s+(\d+)\s+sekund\w*/i
const RETRY_MINS_ONLY = /po\s+(\d+)\s+minut\w*/i
const RETRY_SECS_ONLY = /po\s+(\d+)\s+sekund\w*/i

/**
 * Extracts the retry delay (in ms) from KSeF's Polish-language 429 response body.
 * Returns `null` when the body doesn't contain a recognised pattern.
 */
export function parseKsefRetryMs(responseBody: string): number | null {
  let m = RETRY_MINS_SECS.exec(responseBody)
  if (m) return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000

  m = RETRY_MINS_ONLY.exec(responseBody)
  if (m) return parseInt(m[1], 10) * 60 * 1000

  m = RETRY_SECS_ONLY.exec(responseBody)
  if (m) return parseInt(m[1], 10) * 1000

  return null
}

function parseRetryAfterHeader(response: Response): number | null {
  const raw = response.headers.get('retry-after')
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10) * 1000
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? Math.max(0, parsed - Date.now()) : null
}

// ── Fetch with retry ──

export interface RateLimitFetchOptions {
  /** Max retry attempts on 429. Default: 3. */
  maxRetries?: number
  /** Longest we'll wait for a single retry, in ms. Default: 6 min. */
  maxWaitMs?: number
  /** Called before each retry sleep — use for logging. */
  onRetry?: (attempt: number, waitMs: number) => void | Promise<void>
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_MAX_WAIT_MS = 6 * 60 * 1000

/**
 * Drop-in replacement for `fetch` that retries on HTTP 429 using the delay
 * reported by KSeF (Retry-After header → response body → exponential backoff).
 */
export async function ksefFetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RateLimitFetchOptions = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init)

    if (response.status !== 429 || attempt >= maxRetries) {
      return response
    }

    // Drain the body so we can parse it and free the socket.
    const body = await response.text()

    const waitMs = Math.min(
      parseRetryAfterHeader(response)
        ?? parseKsefRetryMs(body)
        ?? 30_000 * Math.pow(2, attempt), // 30s → 60s → 120s
      maxWaitMs,
    )

    await opts.onRetry?.(attempt, waitMs)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
}
