export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initOtel } = await import('@open-mercato/logger/otel')
    const { initLogger } = await import('@open-mercato/logger')
    initOtel()
    initLogger()
  }
}
