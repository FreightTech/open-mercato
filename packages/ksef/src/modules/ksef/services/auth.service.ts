import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { KsefSession } from '../data/entities'
import type { KsefEnvironment, KsefSessionStatus } from '../data/types'
import {
  getAuthChallengeUrl,
  getAuthKsefTokenUrl,
  getAuthXadesSignatureUrl,
  getAuthStatusUrl,
  getAuthTokenRedeemUrl,
  getAuthTokenRefreshUrl,
  getPublicKeyCertificatesUrl,
  getInvalidateCurrentSessionUrl,
  getOpenOnlineSessionUrl,
} from '../lib/endpoints'
import { generateAesKeyPair, wrapKeyRsaOaep } from '../lib/crypto'
import type {
  KsefAuthChallengeResponse,
  KsefXadesAuthResponse,
  KsefAuthStatusResponse,
  KsefTokenRedeemResponse,
  KsefTokenRefreshResponse,
} from '../lib/types'
import { formatNipForKsef } from '../lib/validators'
import { encryptTokenForKsef } from '../lib/crypto'
import { X509Certificate } from 'crypto'
import { monitoredKsefFetch, withKsefSpan } from '../lib/observability'

async function monitoredFetch(
  url: string,
  init: RequestInit,
  op: string,
  environment: KsefEnvironment,
  nip: string | null,
): Promise<Response> {
  return monitoredKsefFetch(url, init, { op, environment, nip })
}

interface AuthenticateParams {
  tenantId: string
  organizationId: string
  nip: string
  environment: KsefEnvironment
  credentials: KsefCredentials
}

interface KsefCredentials {
  authType: string
  ksefToken?: string
  certificatePem?: string
  privateKeyPem?: string
}

interface AuthenticateResult {
  accessToken: string
  refreshToken: string
  referenceNumber: string
  session: KsefSession
}

/**
 * KSeF 2.0 Authentication Service
 *
 * Adapted from invoicing module to use Integration Marketplace credentials
 * instead of the custom InvoicingKsefCredential entity.
 */
export class KsefAuthService {
  private container: AppContainer

  constructor(opts: { container: AppContainer }) {
    this.container = opts.container
  }

  async authenticate(em: EntityManager, params: AuthenticateParams): Promise<AuthenticateResult> {
    return withKsefSpan(
      { op: 'authenticate', environment: params.environment, nip: params.nip },
      () => this.authenticateInner(em, params),
    )
  }

  private async authenticateInner(em: EntityManager, params: AuthenticateParams): Promise<AuthenticateResult> {
    const formattedNip = formatNipForKsef(params.nip)
    const { environment, tenantId, organizationId, credentials } = params

    const session = em.create(KsefSession, {
      organizationId,
      tenantId,
      sessionType: 'interactive',
      sessionStatus: 'initializing' as KsefSessionStatus,
      nip: formattedNip,
    })
    em.persist(session)
    await em.flush()

    try {
      const challengeResponse = await this.requestChallenge(environment)

      let authResponse: KsefXadesAuthResponse

      if (credentials.authType === 'token') {
        if (!credentials.ksefToken) {
          throw new CrudHttpError(400, { error: 'KSeF token is not configured' })
        }
        authResponse = await this.submitTokenAuth(
          environment,
          formattedNip,
          credentials.ksefToken,
          challengeResponse
        )
      } else {
        if (!credentials.certificatePem || !credentials.privateKeyPem) {
          throw new CrudHttpError(400, { error: 'Certificate and private key are required for certificate auth' })
        }
        authResponse = await this.submitXadesAuth(
          environment,
          credentials.certificatePem,
          credentials.privateKeyPem,
          challengeResponse
        )
      }

      const authenticationToken = authResponse.authenticationToken.token
      const referenceNumber = authResponse.referenceNumber

      await this.pollAuthStatus(environment, referenceNumber, authenticationToken)

      const tokens = await this.redeemTokens(environment, authenticationToken)

      // Open an online session for invoice submission
      const onlineSession = await this.openOnlineSession(
        environment,
        tokens.accessToken.token
      )

      session.sessionStatus = 'active'
      session.sessionToken = tokens.accessToken.token
      session.refreshToken = tokens.refreshToken.token
      session.encryptionKey = Buffer.from(onlineSession.encryptionKey).toString('base64')
      session.encryptionIv = Buffer.from(onlineSession.encryptionIv).toString('base64')
      session.ksefReferenceNumber = onlineSession.sessionReferenceNumber
      session.startedAt = new Date()

      await em.flush()

      return {
        accessToken: tokens.accessToken.token,
        refreshToken: tokens.refreshToken.token,
        referenceNumber: onlineSession.sessionReferenceNumber,
        session,
      }
    } catch (err) {
      session.sessionStatus = 'error'
      session.errorMessage = err instanceof Error ? err.message : 'Authentication failed'
      await em.flush()

      if (err instanceof CrudHttpError) throw err

      throw new CrudHttpError(502, {
        error: `KSeF authentication failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    }
  }

  async refreshAccessToken(
    em: EntityManager,
    sessionId: string,
    environment: KsefEnvironment
  ): Promise<string> {
    return withKsefSpan(
      { op: 'refresh_token', environment, nip: null },
      async () => {
        const session = await em.findOne(KsefSession, { id: sessionId })
        if (!session || session.sessionStatus !== 'active') {
          throw new CrudHttpError(400, { error: 'No active session to refresh' })
        }

        const refreshToken = session.refreshToken
        if (!refreshToken) {
          throw new CrudHttpError(400, { error: 'Session has no refresh token' })
        }

        const url = getAuthTokenRefreshUrl(environment)
        const response = await monitoredFetch(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${refreshToken}`,
            },
          },
          'refresh_token',
          environment,
          session.nip ?? null,
        )

        if (!response.ok) {
          const errorText = await response.text()
          throw new CrudHttpError(502, { error: `Token refresh failed: ${errorText}` })
        }

        const result = (await response.json()) as KsefTokenRefreshResponse
        session.sessionToken = result.accessToken.token
        await em.flush()

        return result.accessToken.token
      },
    )
  }

  async invalidateSession(
    em: EntityManager,
    sessionId: string,
    environment: KsefEnvironment
  ): Promise<void> {
    return withKsefSpan(
      { op: 'invalidate_session', environment, nip: null },
      () => this.invalidateSessionInner(em, sessionId, environment),
    )
  }

  private async invalidateSessionInner(
    em: EntityManager,
    sessionId: string,
    environment: KsefEnvironment
  ): Promise<void> {
    const session = await em.findOne(KsefSession, { id: sessionId })
    if (!session) {
      throw new CrudHttpError(404, { error: 'KSeF session not found' })
    }

    if (session.sessionStatus !== 'active') {
      throw new CrudHttpError(400, { error: `Cannot invalidate session with status "${session.sessionStatus}"` })
    }

    if (!session.sessionToken) {
      throw new CrudHttpError(400, { error: 'Session has no active token' })
    }

    session.sessionStatus = 'closing'
    await em.flush()

    try {
      const url = getInvalidateCurrentSessionUrl(environment)
      const response = await monitoredFetch(
        url,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session.sessionToken}` },
        },
        'invalidate_session',
        environment,
        session.nip ?? null,
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Session invalidation failed (${response.status}): ${errorText}`)
      }

      session.sessionStatus = 'closed'
      session.closedAt = new Date()
      await em.flush()
    } catch (err) {
      session.sessionStatus = 'error'
      session.errorMessage = err instanceof Error ? err.message : 'Invalidation failed'
      await em.flush()
      throw new CrudHttpError(502, {
        error: `KSeF session invalidation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    }
  }

  private async requestChallenge(environment: KsefEnvironment): Promise<KsefAuthChallengeResponse> {
    const url = getAuthChallengeUrl(environment)
    const response = await monitoredFetch(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      'auth_challenge',
      environment,
      null,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Auth challenge failed (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<KsefAuthChallengeResponse>
  }

  private async submitTokenAuth(
    environment: KsefEnvironment,
    nip: string,
    ksefToken: string,
    challenge: KsefAuthChallengeResponse
  ): Promise<KsefXadesAuthResponse> {
    // Strip any whitespace from token (common paste artifact)
    ksefToken = ksefToken.replace(/\s+/g, '')
    const publicKeyUrl = getPublicKeyCertificatesUrl(environment)
    const pkResponse = await monitoredFetch(publicKeyUrl, {}, 'fetch_public_keys', environment, null)
    if (!pkResponse.ok) {
      throw new Error(`Failed to fetch KSeF public key: ${pkResponse.status}`)
    }

    const certificates = (await pkResponse.json()) as Array<{ certificate: string; usage: string[] }>
    const tokenCert = certificates.find((c) => c.usage?.includes('KsefTokenEncryption')) ?? certificates[0]
    if (!tokenCert) {
      throw new Error('No public key certificates returned by KSeF')
    }
    const certBase64 = tokenCert.certificate
    const pemCert =
      '-----BEGIN CERTIFICATE-----\n' +
      certBase64.match(/.{1,64}/g)!.join('\n') +
      '\n-----END CERTIFICATE-----'
    const x509 = new X509Certificate(pemCert)
    const publicKeyPem = x509.publicKey.export({ type: 'spki', format: 'pem' }) as string

    const timestampMs = new Date(challenge.timestamp).getTime()
    const encryptedToken = encryptTokenForKsef(ksefToken, timestampMs, publicKeyPem)

    const url = getAuthKsefTokenUrl(environment)
    const response = await monitoredFetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge: challenge.challenge,
          contextIdentifier: { value: nip, type: 'nip' },
          encryptedToken,
        }),
      },
      'submit_token_auth',
      environment,
      nip,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token auth failed (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<KsefXadesAuthResponse>
  }

  private async submitXadesAuth(
    _environment: KsefEnvironment,
    _certificatePem: string,
    _privateKeyPem: string,
    _challenge: KsefAuthChallengeResponse
  ): Promise<KsefXadesAuthResponse> {
    // XAdES signing is a significant piece of work (XAdES-BES/-T, enveloped
    // or enveloping profile, RSA-PSS or ECDSA signatures, certificate chain
    // embedding, canonicalization). We haven't built it yet — fail fast
    // with a clear error so anyone who accidentally configures `authType:
    // 'certificate'` understands the path is unimplemented instead of
    // hitting a mystery 4xx from the server.
    throw new Error(
      'KSeF XAdES certificate authentication is not yet implemented. ' +
      'Use `authType: "token"` with a KSeF-issued token instead, or ' +
      'implement signing via xml-crypto per ksef-docs/auth/podpis-xades.md.',
    )
  }

  private async pollAuthStatus(
    environment: KsefEnvironment,
    referenceNumber: string,
    authenticationToken: string
  ): Promise<void> {
    // Spec note: async auth verification (OCSP/CRL) can take seconds on
    // test / several seconds-to-minutes on DEMO/PRD. Use an exponential
    // backoff with jitter so multiple concurrent authenticators don't
    // line up in a stampede, capped at ~5 minutes total wall time.
    const MAX_ATTEMPTS = 40
    const BASE_DELAY_MS = 1_000
    const MAX_DELAY_MS = 15_000
    const MAX_WALL_TIME_MS = 5 * 60_000
    const startedAt = Date.now()

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const url = getAuthStatusUrl(environment, referenceNumber)
      const response = await monitoredFetch(
        url,
        { headers: { 'Authorization': `Bearer ${authenticationToken}` } },
        'poll_auth_status',
        environment,
        null,
      )

      if (!response.ok) {
        throw new Error(`Auth status check failed (${response.status})`)
      }

      const result = (await response.json()) as KsefAuthStatusResponse
      const code = result.status.code

      if (code >= 200 && code < 300) return
      if (code >= 400) {
        const details = result.status.details?.join('; ') ?? result.status.description
        throw new Error(`KSeF auth failed (code ${code}): ${details}`)
      }

      if (Date.now() - startedAt > MAX_WALL_TIME_MS) break

      const exponential = BASE_DELAY_MS * Math.pow(1.5, attempt)
      const capped = Math.min(exponential, MAX_DELAY_MS)
      const jittered = Math.round(capped * (0.75 + Math.random() * 0.5))
      await new Promise((resolve) => setTimeout(resolve, jittered))
    }

    throw new Error('KSeF auth timed out after polling')
  }

  private async redeemTokens(
    environment: KsefEnvironment,
    authenticationToken: string
  ): Promise<KsefTokenRedeemResponse> {
    const url = getAuthTokenRedeemUrl(environment)
    const response = await monitoredFetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authenticationToken}`,
        },
      },
      'redeem_tokens',
      environment,
      null,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token redeem failed (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<KsefTokenRedeemResponse>
  }

  private async openOnlineSession(
    environment: KsefEnvironment,
    accessToken: string
  ): Promise<{ sessionReferenceNumber: string; encryptionKey: Buffer; encryptionIv: Buffer }> {
    // Generate AES key pair for session encryption
    const { key, iv } = generateAesKeyPair()

    // Fetch KSeF public key to encrypt the symmetric key
    const publicKeyUrl = getPublicKeyCertificatesUrl(environment)
    const pkResponse = await monitoredFetch(publicKeyUrl, {}, 'fetch_public_keys', environment, null)
    if (!pkResponse.ok) {
      throw new Error(`Failed to fetch KSeF public key: ${pkResponse.status}`)
    }

    const certificates = (await pkResponse.json()) as Array<{ certificate: string; usage: string[] }>
    const encCert = certificates.find((c) => c.usage?.includes('SymmetricKeyEncryption'))
      ?? certificates[0]
    if (!encCert) {
      throw new Error('No public key certificates returned by KSeF')
    }

    const certBase64 = encCert.certificate
    const pemCert =
      '-----BEGIN CERTIFICATE-----\n' +
      certBase64.match(/.{1,64}/g)!.join('\n') +
      '\n-----END CERTIFICATE-----'
    const x509 = new X509Certificate(pemCert)
    const publicKeyPem = x509.publicKey.export({ type: 'spki', format: 'pem' }) as string

    // Wrap AES key with RSA-OAEP
    const encryptedSymmetricKey = wrapKeyRsaOaep(key, publicKeyPem)

    const url = getOpenOnlineSessionUrl(environment)
    const response = await monitoredFetch(
      url,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        formCode: {
          systemCode: 'FA (3)',
          schemaVersion: '1-0E',
          value: 'FA',
        },
        encryption: {
          encryptedSymmetricKey: encryptedSymmetricKey.toString('base64'),
          initializationVector: iv.toString('base64'),
        },
      }),
      },
      'open_online_session',
      environment,
      null,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Open online session failed (${response.status}): ${errorText}`)
    }

    const result = (await response.json()) as { referenceNumber: string; validUntil: string }

    return {
      sessionReferenceNumber: result.referenceNumber,
      encryptionKey: key,
      encryptionIv: iv,
    }
  }
}
