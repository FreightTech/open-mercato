import { getAuthChallengeUrl, getBaseUrl } from './endpoints'
import type { KsefEnvironment } from '../data/types'

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy'
  message: string
  details: Record<string, unknown>
  checkedAt: Date
}

export const ksefHealthCheck = {
  async check(credentials: Record<string, unknown>): Promise<HealthCheckResult> {
    const environment = (credentials.environment as KsefEnvironment) ?? 'test'
    const nip = credentials.nip as string

    try {
      const challengeUrl = getAuthChallengeUrl(environment)
      const response = await fetch(challengeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextIdentifier: { type: 'onip', identifier: nip },
        }),
        signal: AbortSignal.timeout(10_000),
      })

      if (response.ok) {
        return {
          status: 'healthy',
          message: `Connected to KSeF ${environment} environment`,
          details: {
            environment,
            nip,
            apiBaseUrl: getBaseUrl(environment),
            httpStatus: response.status,
          },
          checkedAt: new Date(),
        }
      }

      const body = await response.text().catch(() => '')
      return {
        status: 'unhealthy',
        message: `KSeF API returned HTTP ${response.status}`,
        details: {
          environment,
          nip,
          httpStatus: response.status,
          responseBody: body.substring(0, 500),
        },
        checkedAt: new Date(),
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return {
        status: 'unhealthy',
        message: `KSeF connection failed: ${message}`,
        details: { environment, nip, error: message },
        checkedAt: new Date(),
      }
    }
  },
}
