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

export function resolveEnvironment(): string {
  const appUrl = process.env.APP_URL || ''
  const hostname = appUrl.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()
  
  // Check for development keywords (case-insensitive)
  if (
    hostname.includes('localhost') || 
    hostname.includes('127.0.0.1') ||
    hostname.includes('dev') ||
    hostname.includes('test')
  ) {
    return 'development'
  }
  
  // Check for staging keywords (case-insensitive)
  if (hostname.includes('staging') || hostname.includes('stage')) {
    return 'staging'
  }
  
  // Default to production
  return 'production'
}

export function createRootLogger(config?: LoggerConfig): pino.Logger {
  const level = config?.level ?? resolveLevel()
  const pretty = config?.pretty ?? resolvePretty()
  const serviceName = config?.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'open-mercato'
  const environment = resolveEnvironment()

  const transportConfig = buildTransportConfig({
    level,
    pretty,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  })

  const logger = pino({
    level,
    name: serviceName,
    mixin() {
      return { ...getLogContext(), environment }
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
