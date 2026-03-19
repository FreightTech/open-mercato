import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { extractDomain, getBrandByDomain, defaultBrand } from './brands'

// Paths that should be rewritten to brand-specific versions
const brandRewritePaths = ['/', '/login', '/reset', '/onboarding', '/free-quote']

// Note: Do NOT import bootstrap here - middleware runs in Edge runtime
// which cannot use Node.js modules like MikroORM. Bootstrap is called
// in layout.tsx which runs in Node.js runtime.

export function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers)
  const pathname = req.nextUrl.pathname

  // Detect domain and resolve brand
  const host = req.headers.get('host') || req.nextUrl.hostname
  const domain = extractDomain(host)
  const brand = getBrandByDomain(domain)

  // Set brand info in headers for server components
  requestHeaders.set('x-brand-id', brand.id)
  requestHeaders.set('x-brand-domain', domain)

  // Expose current URL path to server components
  requestHeaders.set('x-next-url', pathname)

  // Determine response (rewrite or next)
  let response: NextResponse

  // URL rewriting for non-default brands
  // Rewrites /login → /freighttech/login, / → /freighttech, etc.
  if (brand.id !== defaultBrand.id) {
    const isRewritablePath = brandRewritePaths.some(
      (p) => pathname === p || (p !== '/' && pathname === p + '/')
    )
    const alreadyPrefixed = pathname.startsWith(`/${brand.id}`)

    if (isRewritablePath && !alreadyPrefixed) {
      const newPath = pathname === '/' ? `/${brand.id}` : `/${brand.id}${pathname}`
      const rewriteUrl = req.nextUrl.clone()
      rewriteUrl.pathname = newPath

      response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    } else {
      response = NextResponse.next({ request: { headers: requestHeaders } })
    }
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Set brand cookie if different from current (for API routes and persistence)
  const currentBrandCookie = req.cookies.get('om_brand_id')?.value
  if (currentBrandCookie !== brand.id) {
    response.cookies.set('om_brand_id', brand.id, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year (matches locale cookie pattern)
    })
  }

  return response
}

export const config = {
  matcher: [
    // Match all paths except static files (include API routes for cookie setting)
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
