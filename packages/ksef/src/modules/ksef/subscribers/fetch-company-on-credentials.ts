import type { SubscriberContext } from '@open-mercato/events'
import type { EntityManager } from '@mikro-orm/postgresql'
import { ksefLogger as logger } from '../lib/observability'

export const metadata = {
  event: 'integrations.credentials.updated',
  persistent: true,
  id: 'ksef.fetch_company_on_credentials',
}

interface CredentialsUpdatedPayload {
  integrationId: string
  tenantId: string
  organizationId: string
  userId?: string
  [key: string]: unknown
}

export default async function handle(
  payload: CredentialsUpdatedPayload,
  context?: SubscriberContext
): Promise<void> {
  if (payload?.integrationId !== 'ksef') {
    return
  }

  const tenantId = payload.tenantId
  const organizationId = payload.organizationId
  if (!tenantId || !organizationId) {
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
    const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
    const credentialsService = createCredentialsService(em)
    const credentials = await credentialsService.resolve('ksef', { tenantId, organizationId })

    const nip = credentials?.nip as string | undefined
    if (!nip || !/^\d{10}$/.test(nip)) {
      return
    }

    const { fetchCompanyFromWhiteList, saveCompanyProfile } = await import('../lib/company-profile')
    const profile = await fetchCompanyFromWhiteList(nip)

    if (!profile) {
      return
    }

    await saveCompanyProfile(em, profile, { tenantId, organizationId })

    logger.info('ksef.company_profile.fetched', { nip, name: profile.name })
  } catch (error) {
    logger.error('ksef.company_profile.fetch_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
