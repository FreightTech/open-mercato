export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'

export type LogContext = {
  traceId?: string
  spanId?: string
  tenantId?: string
  userId?: string
  organizationId?: string
  requestId?: string
  module?: string
  service?: string
  [key: string]: unknown
}

export type Logger = {
  debug(msg: string, context?: Record<string, unknown>): void
  info(msg: string, context?: Record<string, unknown>): void
  warn(msg: string, context?: Record<string, unknown>): void
  error(msg: string, context?: Record<string, unknown>): void
  fatal(msg: string, context?: Record<string, unknown>): void
  child(bindings: Record<string, unknown>): Logger
}

export type LoggerConfig = {
  level?: LogLevel
  serviceName?: string
  pretty?: boolean
}
