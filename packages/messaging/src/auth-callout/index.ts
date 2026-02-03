/**
 * NATS Auth Callout Handler
 *
 * Implements NATS Auth Callout for dynamic multi-tenant authentication.
 * When a client connects to NATS, NATS forwards the auth request to this handler.
 * The handler validates credentials and returns permissions scoped to the tenant.
 *
 * @see https://docs.nats.io/running-a-nats-service/configuration/securing_nats/auth_callout
 */

import { sign } from 'jsonwebtoken'

/** NATS Auth Callout request from NATS server */
export interface AuthCalloutRequest {
  /** Connection options from the client */
  connect_opts: {
    /** Auth token provided by client */
    auth_token?: string
    /** Username for user/password auth */
    user?: string
    /** Password for user/password auth */
    pass?: string
    /** Client name */
    name?: string
    /** Protocol version */
    protocol?: number
  }
  /** Client information */
  client_info: {
    /** Client IP address */
    host?: string
    /** Client port */
    port?: number
    /** Client ID */
    cid?: number
    /** Client name */
    name?: string
  }
  /** Nonce for signing (optional) */
  nonce?: string
}

/** Tenant resolution result */
export interface TenantInfo {
  /** Tenant ID */
  tenantId: string
  /** Organization ID (optional) */
  organizationId?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/** NATS permissions for publish/subscribe */
export interface NatsPermissions {
  /** Allowed publish subjects */
  publish?: {
    allow?: string[]
    deny?: string[]
  }
  /** Allowed subscribe subjects */
  subscribe?: {
    allow?: string[]
    deny?: string[]
  }
}

/** Auth callout response */
export interface AuthCalloutResponse {
  /** JWT token for the client */
  jwt?: string
  /** Error message if auth failed */
  error?: string
}

/** Options for creating an auth callout handler */
export interface AuthCalloutOptions {
  /** JWT signing secret (required) */
  jwtSecret: string
  /** JWT issuer (default: 'open-mercato') */
  issuer?: string
  /** JWT expiration in seconds (default: 3600) */
  expiresIn?: number
  /** Function to resolve tenant from credentials */
  resolveTenant: (request: AuthCalloutRequest) => Promise<TenantInfo | null>
  /** Optional function to build custom permissions */
  buildPermissions?: (tenant: TenantInfo) => NatsPermissions
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Creates a NATS Auth Callout handler.
 *
 * @example
 * ```typescript
 * const handler = createAuthCalloutHandler({
 *   jwtSecret: process.env.NATS_AUTH_SECRET!,
 *   resolveTenant: async (req) => {
 *     const apiKey = req.connect_opts.auth_token
 *     const tenant = await validateApiKey(apiKey)
 *     return tenant ? { tenantId: tenant.id } : null
 *   },
 * })
 *
 * // Use in HTTP endpoint
 * app.post('/nats/auth', async (req, res) => {
 *   const result = await handler(req.body)
 *   res.json(result)
 * })
 * ```
 */
export function createAuthCalloutHandler(options: AuthCalloutOptions) {
  const {
    jwtSecret,
    issuer = 'open-mercato',
    expiresIn = 3600,
    resolveTenant,
    buildPermissions,
    debug = false,
  } = options

  function log(...args: unknown[]): void {
    if (debug) console.log('[nats-auth]', ...args)
  }

  /**
   * Default permissions builder - allows publish/subscribe to tenant-prefixed subjects.
   */
  function defaultBuildPermissions(tenant: TenantInfo): NatsPermissions {
    const tenantPrefix = `${tenant.tenantId}.>`

    return {
      publish: {
        allow: [tenantPrefix],
      },
      subscribe: {
        allow: [tenantPrefix],
      },
    }
  }

  /**
   * Handle an auth callout request from NATS.
   */
  return async function handleAuthCallout(
    request: AuthCalloutRequest
  ): Promise<AuthCalloutResponse> {
    log('Auth callout request:', {
      user: request.connect_opts.user,
      hasToken: !!request.connect_opts.auth_token,
      clientHost: request.client_info.host,
    })

    try {
      // Resolve tenant from credentials
      const tenant = await resolveTenant(request)

      if (!tenant) {
        log('Auth failed: tenant not resolved')
        return { error: 'Authentication failed' }
      }

      log('Tenant resolved:', tenant.tenantId)

      // Build permissions
      const permissions = buildPermissions
        ? buildPermissions(tenant)
        : defaultBuildPermissions(tenant)

      // Create JWT payload
      const payload = {
        sub: tenant.tenantId,
        iss: issuer,
        nats: {
          pub: permissions.publish,
          sub: permissions.subscribe,
        },
        tenant: {
          id: tenant.tenantId,
          organizationId: tenant.organizationId,
          ...tenant.metadata,
        },
      }

      // Sign JWT
      const jwt = sign(payload, jwtSecret, {
        expiresIn,
        algorithm: 'HS256',
      })

      log('Auth successful, JWT issued for tenant:', tenant.tenantId)

      return { jwt }
    } catch (error) {
      log('Auth error:', error)
      return { error: 'Internal authentication error' }
    }
  }
}

/**
 * Creates an auth callout handler that validates API keys.
 *
 * @param options - Handler options
 * @param validateApiKey - Function to validate API key and return tenant info
 */
export function createApiKeyAuthCallout(
  options: Omit<AuthCalloutOptions, 'resolveTenant'>,
  validateApiKey: (apiKey: string) => Promise<TenantInfo | null>
) {
  return createAuthCalloutHandler({
    ...options,
    resolveTenant: async (request) => {
      const apiKey = request.connect_opts.auth_token
      if (!apiKey) return null
      return validateApiKey(apiKey)
    },
  })
}

// Re-export HTTP handler
export {
  createAuthCalloutHttpHandler,
  type AuthCalloutHttpHandlerOptions,
} from './handler'
