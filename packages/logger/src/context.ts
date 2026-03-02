import { AsyncLocalStorage } from 'node:async_hooks'
import type { LogContext } from './types'

const logContextStorage = new AsyncLocalStorage<LogContext>()

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  const parent = getLogContext()
  const merged = { ...parent, ...context }
  return logContextStorage.run(merged, fn)
}

export function getLogContext(): LogContext {
  return logContextStorage.getStore() ?? {}
}
