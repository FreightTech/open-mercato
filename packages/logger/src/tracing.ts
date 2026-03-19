import { trace, SpanStatusCode, type Span, type Tracer, type SpanOptions as OtelSpanOptions } from '@opentelemetry/api'

/**
 * Get or create a tracer instance for the given name.
 * Uses the global TracerProvider registered by the OTel SDK.
 */
export function getTracer(name: string = 'open-mercato'): Tracer {
  return trace.getTracer(name)
}

export type SpanOptions = {
  /** Span name (e.g., "carrier.maersk.fetchEvents") */
  name: string
  /** Attributes to attach to the span */
  attributes?: Record<string, string | number | boolean>
  /** Optional OpenTelemetry span options */
  otelOptions?: OtelSpanOptions
}

/**
 * Execute an async function within an OpenTelemetry span.
 *
 * The span is automatically ended when the function completes.
 * On success, span status is set to OK.
 * On error, span status is set to ERROR with the error message.
 *
 * @example
 * ```ts
 * const result = await withSpan(
 *   { name: 'carrier.maersk.fetchEvents', attributes: { carrierCode: 'maersk' } },
 *   async (span) => {
 *     const response = await fetch(url)
 *     span.setAttribute('http.status_code', response.status)
 *     return response.json()
 *   }
 * )
 * ```
 */
export async function withSpan<T>(
  options: SpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getTracer()

  return tracer.startActiveSpan(options.name, options.otelOptions ?? {}, async (span) => {
    // Set initial attributes
    if (options.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        span.setAttribute(key, value)
      }
    }

    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      span.setStatus({ code: SpanStatusCode.ERROR, message })
      span.recordException(error instanceof Error ? error : new Error(message))
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Execute a sync function within an OpenTelemetry span.
 * Use withSpan for async functions.
 */
export function withSpanSync<T>(
  options: SpanOptions,
  fn: (span: Span) => T,
): T {
  const tracer = getTracer()
  const span = tracer.startSpan(options.name, options.otelOptions)

  // Set initial attributes
  if (options.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      span.setAttribute(key, value)
    }
  }

  try {
    const result = fn(span)
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    span.setStatus({ code: SpanStatusCode.ERROR, message })
    span.recordException(error instanceof Error ? error : new Error(message))
    throw error
  } finally {
    span.end()
  }
}
