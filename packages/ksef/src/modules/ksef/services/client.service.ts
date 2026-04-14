import type { KsefEnvironment } from '../data/types'
import {
  getSendInvoiceUrl,
  getInvoiceStatusUrl,
  getUpoUrl,
  getQueryInvoicesUrl,
  getInvoiceUrl,
} from '../lib/endpoints'
import type {
  KsefSendInvoiceRequest,
  KsefSendInvoiceResponse,
  KsefInvoiceStatusResponse,
  KsefUpoResponse,
  KsefQueryInvoicesRequest,
  KsefQueryInvoicesResponse,
  KsefDownloadInvoiceResponse,
  KsefErrorResponse,
} from '../lib/types'
import {
  recordKsefRequest,
  recordKsefRateLimit,
  recordKsefSessionExpired,
} from '../lib/observability'

export class KsefApiError extends Error {
  readonly statusCode: number
  readonly responseBody: string
  readonly ksefError: KsefErrorResponse | null

  constructor(statusCode: number, responseBody: string) {
    let ksefError: KsefErrorResponse | null = null
    let message = `KSeF API error ${statusCode}`

    try {
      ksefError = JSON.parse(responseBody) as KsefErrorResponse
      if (ksefError?.exception?.exceptionDetailList?.length) {
        const details = ksefError.exception.exceptionDetailList
          .map((detail) => `[${detail.exceptionCode}] ${detail.exceptionDescription}`)
          .join('; ')
        message = `KSeF API error ${statusCode}: ${details}`
      }
    } catch {
      message = `KSeF API error ${statusCode}: ${responseBody.slice(0, 500)}`
    }

    super(message)
    this.name = 'KsefApiError'
    this.statusCode = statusCode
    this.responseBody = responseBody
    this.ksefError = ksefError
  }
}

export class KsefClientService {
  private environment: KsefEnvironment
  private accessToken: string | null = null
  private nip: string | null = null

  constructor(environment: KsefEnvironment) {
    this.environment = environment
  }

  getEnvironment(): KsefEnvironment {
    return this.environment
  }

  setAccessToken(token: string): void {
    this.accessToken = token
  }

  setNip(nip: string | null): void {
    this.nip = nip
  }

  clearAccessToken(): void {
    this.accessToken = null
  }

  hasActiveToken(): boolean {
    return this.accessToken !== null
  }

  async sendInvoice(sessionReferenceNumber: string, request: KsefSendInvoiceRequest): Promise<KsefSendInvoiceResponse> {
    this.assertAccessToken()
    const url = getSendInvoiceUrl(this.environment, sessionReferenceNumber)
    return this.request<KsefSendInvoiceResponse>('POST', url, 'send_invoice', request)
  }

  async getInvoiceStatus(sessionReferenceNumber: string, invoiceReferenceNumber: string): Promise<KsefInvoiceStatusResponse> {
    this.assertAccessToken()
    const url = getInvoiceStatusUrl(this.environment, sessionReferenceNumber, invoiceReferenceNumber)
    return this.request<KsefInvoiceStatusResponse>('GET', url, 'get_invoice_status')
  }

  async downloadUpo(sessionReferenceNumber: string, ksefNumber: string): Promise<KsefUpoResponse> {
    this.assertAccessToken()
    const url = getUpoUrl(this.environment, sessionReferenceNumber, ksefNumber)
    return this.request<KsefUpoResponse>('GET', url, 'download_upo')
  }

  async queryInvoices(request: KsefQueryInvoicesRequest): Promise<KsefQueryInvoicesResponse> {
    this.assertAccessToken()
    const url = getQueryInvoicesUrl(this.environment)
    return this.request<KsefQueryInvoicesResponse>('POST', url, 'query_invoices', request)
  }

  async downloadInvoice(sessionReferenceNumber: string, invoiceReferenceNumber: string): Promise<KsefDownloadInvoiceResponse> {
    this.assertAccessToken()
    const url = getInvoiceUrl(this.environment, sessionReferenceNumber, invoiceReferenceNumber)
    return this.request<KsefDownloadInvoiceResponse>('GET', url, 'download_invoice')
  }

  private assertAccessToken(): void {
    if (!this.accessToken) {
      throw new Error('KSeF access token is required. Call setAccessToken() or authenticate first.')
    }
  }

  /**
   * Maximum number of retries on HTTP 429. Combined with Retry-After the
   * effective wait per retry is bounded by {@link MAX_RETRY_WAIT_MS}.
   */
  private static readonly MAX_429_RETRIES = 4

  /** Hard ceiling on how long we'll honour `Retry-After` before giving up. */
  private static readonly MAX_RETRY_WAIT_MS = 60_000

  private async request<T>(method: string, url: string, op: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body)
    }

    const bindings = { op, environment: this.environment, nip: this.nip }
    const requestStart = Date.now()

    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await fetch(url, fetchOptions)
      } catch (err) {
        recordKsefRequest(bindings, 'error', 0, Date.now() - requestStart)
        throw new Error(
          `KSeF API network error (${method} ${url}): ${err instanceof Error ? err.message : 'Connection failed'}`,
        )
      }

      if (response.status === 429 && attempt < KsefClientService.MAX_429_RETRIES) {
        recordKsefRateLimit(bindings, attempt)
        const waitMs = parseRetryAfterMs(response.headers.get('retry-after'))
          ?? jitteredBackoffMs(attempt)
        const capped = Math.min(waitMs, KsefClientService.MAX_RETRY_WAIT_MS)
        // Drain the body to free the socket before sleeping.
        try { await response.text() } catch { /* ignore */ }
        await sleep(capped)
        continue
      }

      const durationMs = Date.now() - requestStart

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          recordKsefSessionExpired(bindings, response.status)
        }
        recordKsefRequest(
          bindings,
          response.status === 429 ? 'rate_limited' : 'error',
          response.status,
          durationMs,
        )
        const errorText = await response.text()
        throw new KsefApiError(response.status, errorText)
      }

      recordKsefRequest(bindings, 'success', response.status, durationMs)

      const responseText = await response.text()
      if (!responseText || responseText.trim().length === 0) {
        return {} as T
      }

      try {
        return JSON.parse(responseText) as T
      } catch {
        throw new Error(
          `KSeF API returned invalid JSON from ${method} ${url}: ${responseText.slice(0, 200)}`,
        )
      }
    }
  }
}

/**
 * Parses an HTTP `Retry-After` header into milliseconds.
 * Supports both the `delta-seconds` form (RFC 9110 §10.2.3 — a non-negative
 * integer number of seconds) and the HTTP-date form.
 *
 * Exported for unit-testing; not part of the public API.
 */
export function parseRetryAfterMs(raw: string | null | undefined): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000
  }
  const parsed = Date.parse(trimmed)
  if (Number.isFinite(parsed)) {
    const diff = parsed - Date.now()
    return diff > 0 ? diff : 0
  }
  return null
}

/**
 * Returns a jittered exponential backoff delay in milliseconds.
 * attempt 0 → ~500ms, attempt 1 → ~1s, attempt 2 → ~2s, attempt 3 → ~4s.
 * Jitter is `±25%` so concurrent callers don't line up into a stampede.
 *
 * Exported for unit-testing; not part of the public API.
 */
export function jitteredBackoffMs(attempt: number): number {
  const base = 500 * Math.pow(2, attempt)
  const jitter = base * 0.25
  return Math.round(base - jitter + Math.random() * jitter * 2)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
