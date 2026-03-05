export type { Logger, LogLevel, LogContext, LoggerConfig } from './types'
export { createLogger, getRootLogger, initRootLogger, resolveEnvironment } from './logger'
export { runWithLogContext, getLogContext } from './context'
export { patchConsole, restoreConsole } from './console-override'
export { initMetrics, getMeter, shutdownMetrics } from './metrics'
export { startResourceMetrics, stopResourceMetrics } from './resource-metrics'

import { initRootLogger } from './logger'
import { patchConsole } from './console-override'
import type { LoggerConfig } from './types'

let initialized = false

export function initLogger(config?: LoggerConfig): void {
  if (initialized) return
  const logger = initRootLogger(config)
  patchConsole(logger)
  initialized = true
}
