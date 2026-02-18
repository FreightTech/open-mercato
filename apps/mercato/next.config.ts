import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverMinification: false,
    turbopackMinify: false,
  },
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
  ],
}

export default nextConfig
