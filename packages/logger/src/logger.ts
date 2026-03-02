import pino from 'pino'
import { getLogContext } from './context'
import { buildTransportConfig } from './transports'
import type { Logger, LoggerConfig, LogLevel } from './types'

let rootLogger: pino.Logger | null = null

function resolveLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL as LogLevel | undefined
  if (envLevel) return envLevel
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function resolvePretty(): boolean {
  if (process.env.LOG_PRETTY === 'false') return false
  if (process.env.LOG_PRETTY === 'true') return true
  return process.env.NODE_ENV !== 'production'
}

export function createRootLogger(config?: LoggerConfig): pino.Logger {
  const level = config?.level ?? resolveLevel()
  const pretty = config?.pretty ?? resolvePretty()
  const serviceName = config?.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'open-mercato'

  const transportConfig = buildTransportConfig({
    level,
    pretty,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  })

  const logger = pino({
    level,
    name: serviceName,
    mixin() {
      return getLogContext()
    },
    ...transportConfig,
  })

  return logger
}

export function initRootLogger(config?: LoggerConfig): pino.Logger {
  if (rootLogger) return rootLogger
  rootLogger = createRootLogger(config)
  return rootLogger
}

export function getRootLogger(): pino.Logger {
  if (!rootLogger) {
    rootLogger = createRootLogger()
  }
  return rootLogger
}

export function createLogger(module: string, bindings?: Record<string, unknown>): Logger {
  const base = getRootLogger()
  return base.child({ module, ...bindings }) as unknown as Logger
}
