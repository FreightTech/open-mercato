type LogPayload = Record<string, unknown>

export interface TrackingLogContext {
  organizationId?: string
  tenantId?: string
}

const MODULE = 'fms_tracking'

function getServiceName(): string {
  return process.env.OTEL_SERVICE_NAME ?? 'open-mercato'
}

export function getLogContext(ctx?: TrackingLogContext): LogPayload {
  return {
    module: MODULE,
    service: getServiceName(),
    organizationId: ctx?.organizationId,
    tenantId: ctx?.tenantId,
  }
}

export function logInfo(operation: string, data: LogPayload, ctx?: TrackingLogContext): void {
  console.info(`[${MODULE}] ${operation}`, { ...getLogContext(ctx), ...data })
}

export function logDebug(operation: string, data: LogPayload, ctx?: TrackingLogContext): void {
  console.debug(`[${MODULE}] ${operation}`, { ...getLogContext(ctx), ...data })
}

export function logWarn(operation: string, data: LogPayload, ctx?: TrackingLogContext): void {
  console.warn(`[${MODULE}] ${operation}`, { ...getLogContext(ctx), ...data })
}

export function logError(operation: string, error: unknown, data: LogPayload, ctx?: TrackingLogContext): void {
  console.error(`[${MODULE}] ${operation}`, {
    ...getLogContext(ctx),
    ...data,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  })
}
