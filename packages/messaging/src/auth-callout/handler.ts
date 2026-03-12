/**
 * NATS Auth Callout HTTP Handler
 *
 * Provides a ready-to-use HTTP handler for NATS Auth Callout.
 * Can be mounted in any HTTP framework (Next.js, Express, etc.)
 */

import { createAuthCalloutHandler, type AuthCalloutRequest, type TenantInfo } from './index'

export interface AuthCalloutHttpHandlerOptions {
  /** JWT signing secret */
  jwtSecret: string
  /** Function to validate API key and return tenant info */
  validateApiKey: (apiKey: string) => Promise<TenantInfo | null>
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Creates an HTTP handler for NATS Auth Callout.
 *
 * @example
 * ```typescript
 * // Next.js API route
 * import { createAuthCalloutHttpHandler } from '@open-mercato/messaging'
 *
 * const handler = createAuthCalloutHttpHandler({
 *   jwtSecret: process.env.JWT_SECRET!,
 *   validateApiKey: async (apiKey) => {
 *     const key = await findApiKeyBySecret(em, apiKey)
 *     if (!key?.tenantId) return null
 *     return { tenantId: key.tenantId }
 *   },
 * })
 *
 * export async function POST(req: Request) {
 *   return handler(req)
 * }
 * ```
 */
export function createAuthCalloutHttpHandler(options: AuthCalloutHttpHandlerOptions) {
  const { jwtSecret, validateApiKey, debug = false } = options

  const handler = createAuthCalloutHandler({
    jwtSecret,
    debug,
    resolveTenant: async (request) => {
      const apiKey = request.connect_opts.auth_token
      if (!apiKey) {
        if (debug) console.log('[nats-auth] No auth token provided')
        return null
      }
      return validateApiKey(apiKey)
    },
  })

  return async function handleRequest(req: Request): Promise<Response> {
    if (debug) {
      console.log('[nats-auth] Received auth callout request')
    }

    // Parse request body
    let body: AuthCalloutRequest
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate basic structure
    if (!body.connect_opts || !body.client_info) {
      return new Response(JSON.stringify({ error: 'Invalid request format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Handle the auth callout
    const result = await handler(body)

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ jwt: result.jwt }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
