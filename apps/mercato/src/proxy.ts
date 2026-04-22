import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Note: Do NOT import bootstrap here - middleware runs in Edge runtime
// which cannot use Node.js modules like MikroORM. Bootstrap is called
// in layout.tsx which runs in Node.js runtime.

export function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers)
  const pathname = req.nextUrl.pathname

  // Expose current URL path to server components
  requestHeaders.set('x-next-url', pathname)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
