import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverMinification: false,
    turbopackMinify: false,
  },
  devIndicators: false,
  turbopack: {
    // Monorepo root is two levels up from apps/mercato
    root: path.resolve(process.cwd(), "../.."),
  },
  // Transpile packages that import static assets (images, etc.)
  // This allows Next.js webpack to process image imports from package source
  transpilePackages: ['@open-mercato/shipment-tracking'],
  // Externalize packages that are only used in CLI context, not Next.js
  serverExternalPackages: [
    'esbuild',
    '@esbuild/darwin-arm64',
    '@open-mercato/cli',
    // PDF processing packages need to be external to avoid Next.js bundling issues
    'pdf-to-img',
    'pdfjs-dist',
    // Logger + OpenTelemetry packages need native/streaming transports.
    // All @opentelemetry/* packages MUST be externalized so they resolve to
    // the same @opentelemetry/api copy (v1.9.0) from node_modules. Next.js
    // bundles its own compiled @opentelemetry/api v1.6.0 — if our code uses
    // that copy, the semver compatibility check in getGlobal() rejects the
    // MeterProvider registered by the newer copy, and getMeter() silently
    // returns a NoopMeter that discards all metric data.
    'pino',
    'pino-pretty',
    '@opentelemetry/api',
    '@opentelemetry/sdk-node',
    '@opentelemetry/sdk-metrics',
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/sdk-logs',
    '@opentelemetry/exporter-trace-otlp-proto',
    '@opentelemetry/exporter-logs-otlp-proto',
    '@opentelemetry/exporter-metrics-otlp-proto',
    '@opentelemetry/resources',
    '@opentelemetry/semantic-conventions',
    '@opentelemetry/instrumentation-http',
  ],
}

export default nextConfig
