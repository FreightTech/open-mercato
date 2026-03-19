let otelInitialized = false

export function initOtel(): void {
  if (otelInitialized) return

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) {
    otelInitialized = true
    return
  }

  // Lazy-import OTel SDK to avoid loading heavy deps when not needed
  Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-proto'),
    import('@opentelemetry/exporter-logs-otlp-proto'),
    import('@opentelemetry/sdk-logs'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
    import('@opentelemetry/instrumentation-http'),
    import('./logger'),
  ]).then(([
    { NodeSDK },
    { OTLPTraceExporter },
    { OTLPLogExporter },
    { SimpleLogRecordProcessor },
    { Resource },
    { ATTR_SERVICE_NAME },
    { HttpInstrumentation },
    { resolveEnvironment },
  ]) => {
    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'open-mercato'
    const environment = resolveEnvironment()

    const resource = new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      'deployment.environment': environment,
    })

    // Parse OTEL_EXPORTER_OTLP_HEADERS (format: "key=value,key2=value2")
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

    const traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers })
    const logExporter = new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers })

    const sdk = new NodeSDK({
      resource,
      traceExporter,
      logRecordProcessors: [new SimpleLogRecordProcessor(logExporter)],
      instrumentations: [new HttpInstrumentation()],
    })

    sdk.start()

    process.on('SIGTERM', () => {
      sdk.shutdown().catch(() => {})
    })

    // Only mark as initialized on success
    otelInitialized = true
    process.stderr.write('[logger] OTLP logging initialized\n')
  }).catch((err) => {
    // OTel init failed — log but don't crash
    process.stderr.write(`[logger/otel] Failed to initialize OpenTelemetry: ${err?.message ?? err}\n`)
    // Don't set otelInitialized so next call can retry
  })
}
