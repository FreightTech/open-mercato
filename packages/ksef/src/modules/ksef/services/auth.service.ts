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
} from '../lib/endpoints'
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

      session.sessionStatus = 'active'
      session.sessionToken = tokens.accessToken.token
      session.encryptionKey = tokens.refreshToken.token
      session.ksefReferenceNumber = referenceNumber
      session.startedAt = new Date()

      await em.flush()

      return {
        accessToken: tokens.accessToken.token,
        refreshToken: tokens.refreshToken.token,
        referenceNumber,
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
    const session = await em.findOne(KsefSession, { id: sessionId })
    if (!session || session.sessionStatus !== 'active') {
      throw new CrudHttpError(400, { error: 'No active session to refresh' })
    }

    const refreshToken = session.encryptionKey
    if (!refreshToken) {
      throw new CrudHttpError(400, { error: 'Session has no refresh token' })
    }

    const url = getAuthTokenRefreshUrl(environment)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new CrudHttpError(502, { error: `Token refresh failed: ${errorText}` })
    }

    const result = (await response.json()) as KsefTokenRefreshResponse
    session.sessionToken = result.accessToken.token
    await em.flush()

    return result.accessToken.token
  }

  async invalidateSession(
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
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.sessionToken}` },
      })

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
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

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
    const publicKeyUrl = getPublicKeyCertificatesUrl(environment)
    const pkResponse = await fetch(publicKeyUrl)
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
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge: challenge.challenge,
        contextIdentifier: { value: nip, type: 'nip' },
        encryptedToken,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token auth failed (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<KsefXadesAuthResponse>
  }

  private async submitXadesAuth(
    environment: KsefEnvironment,
    certificatePem: string,
    privateKeyPem: string,
    challenge: KsefAuthChallengeResponse
  ): Promise<KsefXadesAuthResponse> {
    const url = getAuthXadesSignatureUrl(environment)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: `<!-- XAdES signed auth request - requires xml-crypto implementation -->`,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`XAdES auth failed (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<KsefXadesAuthResponse>
  }

  private async pollAuthStatus(
    environment: KsefEnvironment,
    referenceNumber: string,
    authenticationToken: string
  ): Promise<void> {
    const maxAttempts = 30
    const pollIntervalMs = 2000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const url = getAuthStatusUrl(environment, referenceNumber)
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${authenticationToken}` },
      })

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

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error('KSeF auth timed out after polling')
  }

  private async redeemTokens(
    environment: KsefEnvironment,
    authenticationToken: string
  ): Promise<KsefTokenRedeemResponse> {
    const url = getAuthTokenRedeemUrl(environment)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authenticationToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token redeem failed (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<KsefTokenRedeemResponse>
  }
}
