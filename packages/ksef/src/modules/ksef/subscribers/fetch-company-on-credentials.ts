import type { SubscriberContext } from '@open-mercato/events'
import type { EntityManager } from '@mikro-orm/postgresql'

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
    // Load credentials to get NIP
    const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
    const credentialsService = createCredentialsService(em)
    const credentials = await credentialsService.resolve('ksef', { tenantId, organizationId })

    const nip = credentials?.nip as string | undefined
    if (!nip || !/^\d{10}$/.test(nip)) {
      return
    }

    // Fetch company data from White List API
    const { fetchCompanyFromWhiteList } = await import('../api/verify-nip/route')
    const profile = await fetchCompanyFromWhiteList(nip)

    if (!profile) {
      return
    }

    // Store in integration credentials (encrypted, tenant-scoped)
    await credentialsService.saveField('ksef', 'company_profile', profile, { tenantId, organizationId })

    console.log(`[ksef] Company profile fetched for NIP ${nip}: ${profile.name}`)
  } catch (error) {
    console.error('[ksef] Failed to fetch company data from White List:', error)
    // Don't throw — this is a best-effort side effect
  }
}
