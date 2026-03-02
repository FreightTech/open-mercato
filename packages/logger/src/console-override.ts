import type pino from 'pino'

const BRACKET_PREFIX = /^\[([^\]]+)\]\s*/

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'
type PinoLevel = 'info' | 'warn' | 'error' | 'debug'

const CONSOLE_TO_PINO: Record<ConsoleMethod, PinoLevel> = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
}

const originals: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {}

export function patchConsole(logger: pino.Logger): void {
  for (const [consoleMethod, pinoLevel] of Object.entries(CONSOLE_TO_PINO) as Array<[ConsoleMethod, PinoLevel]>) {
    const original = console[consoleMethod]
    originals[consoleMethod] = original

    console[consoleMethod] = (...args: unknown[]) => {
      let module: string | undefined
      const context: Record<string, unknown> = {}
      const messageParts: string[] = []

      for (const arg of args) {
        if (typeof arg === 'string') {
          if (messageParts.length === 0) {
            const match = arg.match(BRACKET_PREFIX)
            if (match) {
              module = match[1]
              const rest = arg.slice(match[0].length)
              if (rest) messageParts.push(rest)
              continue
            }
          }
          messageParts.push(arg)
        } else if (arg instanceof Error) {
          context.err = {
            message: arg.message,
            stack: arg.stack,
            type: arg.constructor.name,
          }
        } else if (typeof arg === 'object' && arg !== null) {
          Object.assign(context, arg)
        } else {
          messageParts.push(String(arg))
        }
      }

      const msg = messageParts.join(' ') || '(no message)'
      if (module) context.module = module

      logger[pinoLevel](context, msg)
    }
  }
}

export function restoreConsole(): void {
  for (const [method, original] of Object.entries(originals)) {
    if (original) {
      ;(console as unknown as Record<string, unknown>)[method] = original
    }
  }
}
