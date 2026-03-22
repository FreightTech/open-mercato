import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { InvoicingKsefCredential, InvoicingKsefSession } from '../../data/entities'
import type { KsefEnvironment, KsefSessionStatus } from '../../data/types'
import {
  getAuthChallengeUrl,
  getAuthKsefTokenUrl,
  getAuthXadesSignatureUrl,
  getAuthStatusUrl,
  getAuthTokenRedeemUrl,
  getAuthTokenRefreshUrl,
  getPublicKeyCertificatesUrl,
  getInvalidateCurrentSessionUrl,
} from '../../lib/ksef/endpoints'
import type {
  KsefAuthChallengeResponse,
  KsefXadesAuthResponse,
  KsefAuthStatusResponse,
  KsefTokenRedeemResponse,
  KsefTokenRefreshResponse,
} from '../../lib/ksef/types'
import { formatNipForKsef } from '../../lib/ksef/validators'
import { encryptTokenForKsef } from '../../lib/ksef/crypto'

interface AuthenticateParams {
  tenantId: string
  organizationId: string
  nip: string
  environment: KsefEnvironment
}

interface AuthenticateResult {
  accessToken: string
  refreshToken: string
  referenceNumber: string
  session: InvoicingKsefSession
}

/**
 * KSeF 2.0 Authentication Service
 *
 * Auth flow (v2):
 * 1. POST /v2/auth/challenge → get challenge + timestamp (valid 10 min)
 * 2a. POST /v2/auth/ksef-token → submit encrypted token (token auth)
 * 2b. POST /v2/auth/xades-signature → submit signed XML (cert auth)
 * 3. GET /v2/auth/{referenceNumber} → poll until status=completed
 * 4. POST /v2/auth/token/redeem → exchange authToken for accessToken + refreshToken
 * 5. Use Authorization: Bearer <accessToken> for all subsequent API calls
 * 6. POST /v2/auth/token/refresh → refresh expired accessToken
 */
export class KsefAuthService {
  private container: AppContainer

  constructor(opts: { container: AppContainer }) {
    this.container = opts.container
  }

  async authenticate(em: EntityManager, params: AuthenticateParams): Promise<AuthenticateResult> {
    const formattedNip = formatNipForKsef(params.nip)
    const { environment, tenantId, organizationId } = params

    const credential = await em.findOne(InvoicingKsefCredential, {
      organizationId,
      tenantId,
      nip: formattedNip,
      environment,
      isActive: true,
    })

    if (!credential) {
      throw new CrudHttpError(404, {
        error: `No active KSeF credential found for NIP ${formattedNip} in ${environment} environment`,
      })
    }

    const session = em.create(InvoicingKsefSession, {
      organizationId,
      tenantId,
      sessionType: 'interactive',
      sessionStatus: 'initializing' as KsefSessionStatus,
      nip: formattedNip,
    })
    em.persist(session)
    await em.flush()

    try {
      // Step 1: Get auth challenge
      const challengeResponse = await this.requestChallenge(environment)

      // Step 2: Submit auth request (token or certificate)
      let authResponse: KsefXadesAuthResponse

      if (credential.authType === 'token') {
        if (!credential.ksefToken) {
          throw new CrudHttpError(400, { error: 'KSeF token is not configured for this credential' })
        }
        authResponse = await this.submitTokenAuth(
          environment,
          formattedNip,
          credential.ksefToken,
          challengeResponse
        )
      } else {
        if (!credential.certificatePem || !credential.privateKeyPem) {
          throw new CrudHttpError(400, { error: 'Certificate and private key are required for certificate auth' })
        }
        authResponse = await this.submitXadesAuth(
          environment,
          credential.certificatePem,
          credential.privateKeyPem,
          challengeResponse
        )
      }

      const authenticationToken = authResponse.authenticationToken.token
      const referenceNumber = authResponse.referenceNumber

      // Step 3: Poll auth status until completed
      await this.pollAuthStatus(environment, referenceNumber, authenticationToken)

      // Step 4: Redeem auth token for access + refresh tokens
      const tokens = await this.redeemTokens(environment, authenticationToken)

      // Update session with tokens
      session.sessionStatus = 'active'
      session.sessionToken = tokens.accessToken.token
      session.encryptionKey = tokens.refreshToken.token
      session.ksefReferenceNumber = referenceNumber
      session.startedAt = new Date()

      credential.lastUsedAt = new Date()

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
    const session = await em.findOne(InvoicingKsefSession, { id: sessionId })
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
    const session = await em.findOne(InvoicingKsefSession, { id: sessionId })
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

  // -- Private methods --

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
    // Fetch KSeF public key for token encryption
    const publicKeyUrl = getPublicKeyCertificatesUrl(environment)
    const pkResponse = await fetch(publicKeyUrl)
    if (!pkResponse.ok) {
      throw new Error(`Failed to fetch KSeF public key: ${pkResponse.status}`)
    }
    const publicKeyPem = await pkResponse.text()

    // Encrypt: token|timestamp with RSA-OAEP
    const tokenWithTimestamp = `${ksefToken}|${challenge.timestamp}`
    const encryptedToken = encryptTokenForKsef(tokenWithTimestamp, challenge.challenge, publicKeyPem)

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
    // XAdES signing would be done here — for now, submit the signed XML
    // The actual XAdES XML construction requires xml-crypto or similar
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

      const status = (await response.json()) as KsefAuthStatusResponse

      if (status.status === 'completed') return
      if (status.status === 'failed') {
        throw new Error(`KSeF auth failed: ${status.errorDescription ?? 'Unknown reason'}`)
      }

      // Still pending — wait and retry
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
