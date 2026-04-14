import { createLogger, getMeter } from '@open-mercato/logger'
import { withSpan } from '@open-mercato/logger/tracing'
import type { Span } from '@opentelemetry/api'

const MODULE_NAME = 'ksef'

export const ksefLogger = createLogger(MODULE_NAME)

type Counter = ReturnType<ReturnType<typeof getMeter>['createCounter']>
type Histogram = ReturnType<ReturnType<typeof getMeter>['createHistogram']>

let cachedRequestsCounter: Counter | null = null
let cachedRequestDurationHistogram: Histogram | null = null
let cachedSessionExpiredCounter: Counter | null = null
let cachedSubmissionCounter: Counter | null = null
let cachedPollAttemptCounter: Counter | null = null
let cachedRateLimitCounter: Counter | null = null

function meter() {
  return getMeter(MODULE_NAME)
}

function requestsCounter(): Counter {
  if (!cachedRequestsCounter) {
    cachedRequestsCounter = meter().createCounter('ksef.requests.total', {
      description: 'KSeF outbound HTTP request count by op and status',
      unit: '1',
    })
  }
  return cachedRequestsCounter
}

function requestDurationHistogram(): Histogram {
  if (!cachedRequestDurationHistogram) {
    cachedRequestDurationHistogram = meter().createHistogram('ksef.request.duration_ms', {
      description: 'KSeF outbound HTTP request duration in milliseconds',
      unit: 'ms',
    })
  }
  return cachedRequestDurationHistogram
}

function sessionExpiredCounter(): Counter {
  if (!cachedSessionExpiredCounter) {
    cachedSessionExpiredCounter = meter().createCounter('ksef.session.expired.total', {
      description: 'KSeF session/auth token expiry events (HTTP 401/403)',
      unit: '1',
    })
  }
  return cachedSessionExpiredCounter
}

function submissionCounter(): Counter {
  if (!cachedSubmissionCounter) {
    cachedSubmissionCounter = meter().createCounter('ksef.submission.total', {
      description: 'KSeF invoice submission outcomes',
      unit: '1',
    })
  }
  return cachedSubmissionCounter
}

function pollAttemptCounter(): Counter {
  if (!cachedPollAttemptCounter) {
    cachedPollAttemptCounter = meter().createCounter('ksef.poll.attempt.total', {
      description: 'KSeF status poll attempts by outcome',
      unit: '1',
    })
  }
  return cachedPollAttemptCounter
}

function rateLimitCounter(): Counter {
  if (!cachedRateLimitCounter) {
    cachedRateLimitCounter = meter().createCounter('ksef.rate_limit.429.total', {
      description: 'KSeF rate-limit (HTTP 429) responses',
      unit: '1',
    })
  }
  return cachedRateLimitCounter
}

export type KsefRequestStatus = 'success' | 'error' | 'rate_limited'

export type KsefBindings = {
  op: string
  environment: string | null
  nip?: string | null
}

function attrs(b: KsefBindings, extra: Record<string, string | number> = {}) {
  return {
    'ksef.op': b.op,
    'ksef.environment': b.environment ?? 'unknown',
    'ksef.nip': b.nip ?? 'unknown',
    ...extra,
  }
}

export function recordKsefRequest(
  bindings: KsefBindings,
  status: KsefRequestStatus,
  statusCode: number,
  durationMs: number,
): void {
  requestsCounter().add(1, attrs(bindings, { 'ksef.status': status, 'ksef.status_code': statusCode }))
  requestDurationHistogram().record(durationMs, attrs(bindings, { 'ksef.status': status }))
}

export function recordKsefRateLimit(bindings: KsefBindings, retryCount: number): void {
  rateLimitCounter().add(1, attrs(bindings, { 'ksef.retry_count': retryCount }))
}

export function recordKsefSessionExpired(bindings: KsefBindings, statusCode: number): void {
  sessionExpiredCounter().add(1, attrs(bindings, { 'ksef.status_code': statusCode }))
}

export type KsefSubmissionOutcome =
  | 'queued'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'error'
  | 'upo_downloaded'
  | 'skipped'

export function recordKsefSubmission(
  bindings: KsefBindings,
  outcome: KsefSubmissionOutcome,
): void {
  submissionCounter().add(1, attrs(bindings, { 'ksef.outcome': outcome }))
}

export type KsefPollOutcome = 'pending' | 'accepted' | 'rejected' | 'error' | 'timeout' | 'skipped'

export function recordKsefPollAttempt(
  bindings: KsefBindings,
  outcome: KsefPollOutcome,
): void {
  pollAttemptCounter().add(1, attrs(bindings, { 'ksef.outcome': outcome }))
}

export async function monitoredKsefFetch(
  url: string,
  init: RequestInit,
  bindings: KsefBindings,
): Promise<Response> {
  const start = Date.now()
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (err) {
    recordKsefRequest(bindings, 'error', 0, Date.now() - start)
    throw err
  }
  const duration = Date.now() - start
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      recordKsefSessionExpired(bindings, response.status)
    }
    recordKsefRequest(
      bindings,
      response.status === 429 ? 'rate_limited' : 'error',
      response.status,
      duration,
    )
  } else {
    recordKsefRequest(bindings, 'success', response.status, duration)
  }
  return response
}

export async function withKsefSpan<T>(
  bindings: KsefBindings,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan(
    {
      name: `ksef.${bindings.op}`,
      attributes: {
        'ksef.op': bindings.op,
        'ksef.environment': bindings.environment ?? 'unknown',
        'ksef.nip': bindings.nip ?? 'unknown',
      },
    },
    fn,
  )
}
