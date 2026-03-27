/**
 * Shared logging helper for Invoicing module.
 * Provides consistent structured logging with service and brand context.
 */

type LogPayload = Record<string, unknown>

export interface InvoicingLogContext {
  brandId?: string | null
  organizationId?: string | null
  tenantId?: string | null
}

function getServiceName(): string {
  return process.env.OTEL_SERVICE_NAME ?? 'open-mercato'
}

export function getLogContext(module: string, ctx?: InvoicingLogContext): LogPayload {
  return {
    module,
    service: getServiceName(),
    brandId: ctx?.brandId ?? null,
    organizationId: ctx?.organizationId ?? null,
    tenantId: ctx?.tenantId ?? null,
  }
}

export function createInvoicingLogger(module: string) {
  return {
    info(operation: string, data: LogPayload, ctx?: InvoicingLogContext): void {
      console.info(`[${module}] ${operation}`, { ...getLogContext(module, ctx), ...data })
    },

    debug(operation: string, data: LogPayload, ctx?: InvoicingLogContext): void {
      console.debug(`[${module}] ${operation}`, { ...getLogContext(module, ctx), ...data })
    },

    warn(operation: string, data: LogPayload, ctx?: InvoicingLogContext): void {
      console.warn(`[${module}] ${operation}`, { ...getLogContext(module, ctx), ...data })
    },

    error(operation: string, error: unknown, data: LogPayload, ctx?: InvoicingLogContext): void {
      console.error(`[${module}] ${operation}`, {
        ...getLogContext(module, ctx),
        ...data,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      })
    },
  }
}

export type InvoicingLogger = ReturnType<typeof createInvoicingLogger>
