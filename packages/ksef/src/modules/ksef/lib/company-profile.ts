import type { EntityManager } from '@mikro-orm/postgresql'
import { createCredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import { KsefCompanyProfileRecord } from '../data/entities'

const WHITE_LIST_BASE_URL = 'https://wl-api.mf.gov.pl/api/search/nip'

export interface KsefCompanyProfile {
  nip: string
  name: string
  regon: string | null
  krs: string | null
  residenceAddress: string | null
  workingAddress: string | null
  statusVat: string | null
  accountNumbers: string[]
  verifiedAt: string
}

export interface CompanyProfileScope {
  tenantId: string
  organizationId?: string | null
}

interface WhiteListResponse {
  result: {
    subject: {
      name: string
      nip: string
      regon: string | null
      krs: string | null
      residenceAddress: string | null
      workingAddress: string | null
      statusVat: string | null
      accountNumbers: string[] | null
    } | null
    requestId: string
  }
}

export async function fetchCompanyFromWhiteList(nip: string): Promise<KsefCompanyProfile | null> {
  const today = new Date().toISOString().slice(0, 10)
  const url = `${WHITE_LIST_BASE_URL}/${nip}?date=${today}`

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`White List API returned ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as WhiteListResponse
  const subject = data.result?.subject

  if (!subject) {
    return null
  }

  return {
    nip: subject.nip ?? nip,
    name: subject.name,
    regon: subject.regon ?? null,
    krs: subject.krs ?? null,
    residenceAddress: subject.residenceAddress ?? null,
    workingAddress: subject.workingAddress ?? null,
    statusVat: subject.statusVat ?? null,
    accountNumbers: subject.accountNumbers ?? [],
    verifiedAt: new Date().toISOString(),
  }
}

export async function getCompanyProfile(
  em: EntityManager,
  scope: CompanyProfileScope,
): Promise<KsefCompanyProfile | null> {
  const fork = em.fork()
  const record = await fork.findOne(KsefCompanyProfileRecord, { tenantId: scope.tenantId })
  if (record) {
    return record.profileData as unknown as KsefCompanyProfile
  }

  // Legacy backfill: earlier versions stored the profile inside the integrations
  // credentials blob. Migrate it forward on first read, then the dedicated table
  // becomes authoritative. The credentials store is scoped by org, so skip the
  // backfill when no org is in scope.
  if (!scope.organizationId) {
    return null
  }
  const credentialsService = createCredentialsService(fork)
  const credentials = await credentialsService.resolve('ksef', {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  const legacy = credentials?.company_profile as KsefCompanyProfile | undefined
  if (!legacy || typeof legacy !== 'object' || !legacy.nip) {
    return null
  }
  await saveCompanyProfile(fork, legacy, scope)
  return legacy
}

export async function saveCompanyProfile(
  em: EntityManager,
  profile: KsefCompanyProfile,
  scope: CompanyProfileScope,
): Promise<void> {
  const fork = em.fork()
  const existing = await fork.findOne(KsefCompanyProfileRecord, { tenantId: scope.tenantId })
  if (existing) {
    existing.nip = profile.nip
    existing.profileData = profile as unknown as Record<string, unknown>
    existing.fetchedAt = new Date()
    if (scope.organizationId) {
      existing.organizationId = scope.organizationId
    }
  } else {
    const record = fork.create(KsefCompanyProfileRecord, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? null,
      nip: profile.nip,
      profileData: profile as unknown as Record<string, unknown>,
      fetchedAt: new Date(),
    })
    fork.persist(record)
  }
  await fork.flush()
}
