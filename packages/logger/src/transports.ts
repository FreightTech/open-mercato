import type { LogLevel } from './types'

type TransportTarget = {
  target: string
  level?: string
  options?: Record<string, unknown>
}

export function buildTransportConfig(options: {
  level: LogLevel
  pretty: boolean
  otlpEndpoint?: string
}): { transport?: { targets: TransportTarget[] } } | Record<string, never> {
  const targets: TransportTarget[] = []

  if (options.pretty) {
    targets.push({
      target: 'pino-pretty',
      level: options.level,
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'HH:MM:ss.l',
      },
    })
  } else {
    targets.push({
      target: 'pino/file',
      level: options.level,
      options: { destination: 1 }, // stdout
    })
  }

  if (targets.length === 0) return {}

  return { transport: { targets } }
}
