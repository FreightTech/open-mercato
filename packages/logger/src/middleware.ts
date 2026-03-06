import { randomUUID } from 'node:crypto'
import { runWithLogContext } from './context'
import { getRootLogger } from './logger'
import { getMeter } from './metrics'

type RequestInfo = {
  method: string
  path: string
  tenantId?: string | null
  userId?: string | null
  organizationId?: string | null
}

// Normalize paths to avoid high-cardinality metric labels.
// Replaces UUID segments and numeric IDs with placeholders.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const NUMERIC_ID_RE = /\/\d+(?=\/|$)/g

function normalizePath(path: string): string {
  return path.replace(UUID_RE, ':id').replace(NUMERIC_ID_RE, '/:id')
}

// Lazy-initialized metric instruments.
// They use the global MeterProvider — if metrics are disabled, the OTel API
// returns no-op instruments that silently discard data.
let requestCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null
let requestDuration: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null

function ensureInstruments() {
  if (requestCounter) return
  const meter = getMeter('http')
  requestCounter = meter.createCounter('http.server.requests', {
    description: 'Total number of HTTP requests handled',
    unit: '1',
  })
  requestDuration = meter.createHistogram('http.server.duration', {
    description: 'HTTP request duration',
    unit: 'ms',
  })
}

function recordMetrics(method: string, path: string, statusCode: number, durationMs: number) {
  ensureInstruments()
  const route = normalizePath(path)
  const attrs = { method, route, status: String(statusCode) }
  requestCounter!.add(1, attrs)
  requestDuration!.record(durationMs, attrs)
}

function extractStatusCode(result: unknown): number {
  if (result && typeof result === 'object' && 'status' in result && typeof (result as any).status === 'number') {
    return (result as any).status
  }
  return 200
}

export function withRequestLogging<T>(
  requestInfo: RequestInfo,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const requestId = randomUUID()
  const logger = getRootLogger()

  const context = {
    requestId,
    method: requestInfo.method,
    path: requestInfo.path,
    ...(requestInfo.tenantId ? { tenantId: requestInfo.tenantId } : {}),
    ...(requestInfo.userId ? { userId: requestInfo.userId } : {}),
    ...(requestInfo.organizationId ? { organizationId: requestInfo.organizationId } : {}),
  }

  return runWithLogContext(context, () => {
    const start = performance.now()
    logger.info(context, `${requestInfo.method} ${requestInfo.path}`)

    const result = fn()

    if (result instanceof Promise) {
      return result.then(
        (resolved) => {
          const durationMs = Math.round(performance.now() - start)
          const statusCode = extractStatusCode(resolved)
          logger.info({ ...context, durationMs, statusCode }, `${requestInfo.method} ${requestInfo.path} completed`)
          recordMetrics(requestInfo.method, requestInfo.path, statusCode, durationMs)
          return resolved
        },
        (err) => {
          const durationMs = Math.round(performance.now() - start)
          logger.info({ ...context, durationMs, statusCode: 500 }, `${requestInfo.method} ${requestInfo.path} completed`)
          recordMetrics(requestInfo.method, requestInfo.path, 500, durationMs)
          throw err
        },
      )
    }

    const durationMs = Math.round(performance.now() - start)
    const statusCode = extractStatusCode(result)
    logger.info({ ...context, durationMs, statusCode }, `${requestInfo.method} ${requestInfo.path} completed`)
    recordMetrics(requestInfo.method, requestInfo.path, statusCode, durationMs)
    return result
  })
}
