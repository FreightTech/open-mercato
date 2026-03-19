/**
 * Shared logging helper for FMS modules.
 * Provides consistent structured logging with service and brand context.
 */

type LogPayload = Record<string, unknown>

export interface FmsLogContext {
  brandId?: string | null
  organizationId?: string | null
  tenantId?: string | null
}

function getServiceName(): string {
  return process.env.OTEL_SERVICE_NAME ?? 'open-mercato'
}

export function getLogContext(module: string, ctx?: FmsLogContext): LogPayload {
  return {
    module,
    service: getServiceName(),
    brandId: ctx?.brandId ?? null,
    organizationId: ctx?.organizationId ?? null,
    tenantId: ctx?.tenantId ?? null,
  }
}

export function createFmsLogger(module: string) {
  return {
    info(operation: string, data: LogPayload, ctx?: FmsLogContext): void {
      console.info(`[${module}] ${operation}`, { ...getLogContext(module, ctx), ...data })
    },

    debug(operation: string, data: LogPayload, ctx?: FmsLogContext): void {
      console.debug(`[${module}] ${operation}`, { ...getLogContext(module, ctx), ...data })
    },

    warn(operation: string, data: LogPayload, ctx?: FmsLogContext): void {
      console.warn(`[${module}] ${operation}`, { ...getLogContext(module, ctx), ...data })
    },

    error(operation: string, error: unknown, data: LogPayload, ctx?: FmsLogContext): void {
      console.error(`[${module}] ${operation}`, {
        ...getLogContext(module, ctx),
        ...data,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      })
    },
  }
}

export type FmsLogger = ReturnType<typeof createFmsLogger>
