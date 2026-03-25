/**
 * Get the base URL for the current request.
 * For redirects, always uses the request's host header to preserve brand domain.
 * Falls back to environment variables only when host header is not available.
 */
export function getAppBaseUrl(req: Request): string {
  // Always prefer the request's host header to preserve brand domain on redirects
  const host = req.headers.get('host')
  if (host) {
    const url = new URL(req.url)
    const protocol = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
    return `${protocol}://${host}`
  }
  // Fallback for edge cases where host header is not available
  const url = new URL(req.url)
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    `${url.protocol}//${url.host}`
  )
}

/**
 * Convert a relative path to an absolute URL using the request's host.
 * This preserves the brand domain for redirects across different branded domains.
 */
export function toAbsoluteUrl(req: Request, path: string): string {
  return new URL(path, getAppBaseUrl(req)).toString()
}
