import { randomUUID } from 'node:crypto'
import { runWithLogContext } from './context'
import { getRootLogger } from './logger'

type RequestInfo = {
  method: string
  path: string
  tenantId?: string | null
  userId?: string | null
  organizationId?: string | null
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
      return result.finally(() => {
        const durationMs = Math.round(performance.now() - start)
        logger.info({ ...context, durationMs }, `${requestInfo.method} ${requestInfo.path} completed`)
      })
    }

    const durationMs = Math.round(performance.now() - start)
    logger.info({ ...context, durationMs }, `${requestInfo.method} ${requestInfo.path} completed`)
    return result
  })
}
