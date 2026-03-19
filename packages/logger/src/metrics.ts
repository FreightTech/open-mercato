import { metrics } from '@opentelemetry/api'

let metricsInitialized = false
let meterProvider: any = null
let initPromise: Promise<void> | null = null

export function initMetrics(): Promise<void> {
  if (metricsInitialized) return Promise.resolve()
  if (initPromise) return initPromise

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) {
    metricsInitialized = true
    return Promise.resolve()
  }

  // Lazy-import OTel SDK to avoid loading heavy deps when not needed
  initPromise = Promise.all([
    import('@opentelemetry/sdk-metrics'),
    import('@opentelemetry/exporter-metrics-otlp-proto'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
    import('./logger'),
  ]).then(([
    { MeterProvider, PeriodicExportingMetricReader },
    { OTLPMetricExporter },
    { Resource },
    { ATTR_SERVICE_NAME },
    { resolveEnvironment },
  ]) => {
    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'open-mercato'
    const environment = resolveEnvironment()

    const resource = new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      'deployment.environment': environment,
    })

    // Parse OTEL_EXPORTER_OTLP_HEADERS
    const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS
    const headers: Record<string, string> = {}
    if (rawHeaders) {
      for (const pair of rawHeaders.split(',')) {
        const eqIndex = pair.indexOf('=')
        if (eqIndex > 0) {
          headers[pair.slice(0, eqIndex).trim()] = pair.slice(eqIndex + 1).trim()
        }
      }
    }

    const metricExporter = new OTLPMetricExporter({
      url: `${endpoint}/v1/metrics`,
      headers,
    })

    // Read export interval from env var with fallback to 60 seconds
    const exportInterval = process.env.METRICS_EXPORT_INTERVAL 
      ? parseInt(process.env.METRICS_EXPORT_INTERVAL, 10)
      : 60000

    // Cast to any due to version mismatch between OTLP exporter and SDK (works at runtime)
    meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter as any,
          exportIntervalMillis: exportInterval,
        }),
      ],
    })

    metrics.setGlobalMeterProvider(meterProvider)

    // Graceful shutdown
    process.on('SIGTERM', () => {
      if (meterProvider) {
        meterProvider.shutdown().catch(() => {})
      }
    })

    metricsInitialized = true
    const intervalSec = exportInterval / 1000
    process.stderr.write(`[logger] Metrics provider initialized (${intervalSec}s interval)\n`)
  }).catch((err) => {
    // Metrics init failed — allow retry on next call
    initPromise = null
    process.stderr.write(`[logger/metrics] Failed to initialize OpenTelemetry metrics: ${err?.message ?? err}\n`)
    throw err
  })

  return initPromise
}

export function getMeter(name: string = 'open-mercato') {
  return metrics.getMeter(name)
}

export function shutdownMetrics(): Promise<void> {
  if (meterProvider) {
    return meterProvider.shutdown()
  }
  return Promise.resolve()
}
