import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const isDevelopment = process.env.NODE_ENV !== 'production'
const appPackageJsonPath = new URL('./package.json', import.meta.url)
const appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8')) as {
  dependencies?: Record<string, string>
}
const transpiledWorkspacePackages = Object.keys(appPackageJson.dependencies ?? {}).filter(
  (packageName) => packageName.startsWith('@open-mercato/') && packageName !== '@open-mercato/cli',
)

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data: https:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob: https:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: ws: wss:",
].join('; ')

const nextConfig: NextConfig = {
  distDir: '.mercato/next',
  //transpilePackages: isDevelopment ? transpiledWorkspacePackages : undefined,
  experimental: {
    serverMinification: false,
    turbopackMinify: false,
    ...(isDevelopment
      ? {
          preloadEntriesOnStart: false,
        }
      : {}),
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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // Attachment file downloads set their own restrictive CSP (sandbox)
        // in the route handler — override the global app CSP so it is not
        // replaced at the Next.js config layer.
        source: '/api/attachments/file/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
}

export default nextConfig
