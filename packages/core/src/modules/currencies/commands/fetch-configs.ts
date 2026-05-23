import type { EntityManager } from '@mikro-orm/core'
import { z } from 'zod'
import { CurrencyFetchConfig } from '../data/entities'
import {
  currencyFetchConfigCreateSchema,
  currencyFetchConfigUpdateSchema,
} from '../data/validators'
import type { CurrencyFetchScheduleService } from '../lib/fetchScheduleService'

export interface FetchConfigCommandScope {
  tenantId: string
  organizationId: string
  userId?: string
}

export interface FetchConfigCommandDeps {
  fetchScheduleService?: CurrencyFetchScheduleService
}

export async function createFetchConfig(
  em: EntityManager,
  input: z.infer<typeof currencyFetchConfigCreateSchema>,
  scope: FetchConfigCommandScope,
  deps: FetchConfigCommandDeps = {},
): Promise<CurrencyFetchConfig> {
  const validated = currencyFetchConfigCreateSchema.parse(input)

  const existing = await em.findOne(CurrencyFetchConfig, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    provider: validated.provider,
  })

  if (existing) {
    throw new Error(`Provider ${validated.provider} already configured`)
  }

  const config = em.create(CurrencyFetchConfig, {
    ...validated,
    timezone: validated.timezone ?? 'UTC',
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await em.persist(config).flush()

  await deps.fetchScheduleService?.syncFromConfig(config)

  return config
}

export async function updateFetchConfig(
  em: EntityManager,
  id: string,
  input: z.infer<typeof currencyFetchConfigUpdateSchema>,
  scope: FetchConfigCommandScope,
  deps: FetchConfigCommandDeps = {},
): Promise<CurrencyFetchConfig> {
  const validated = currencyFetchConfigUpdateSchema.parse(input)

  const config = await em.findOne(CurrencyFetchConfig, {
    id,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
  })

  if (!config) {
    throw new Error('Fetch config not found')
  }

  em.assign(config, validated)
  await em.persist(config).flush()

  await deps.fetchScheduleService?.syncFromConfig(config)

  return config
}

export async function deleteFetchConfig(
  em: EntityManager,
  id: string,
  scope: FetchConfigCommandScope,
  deps: FetchConfigCommandDeps = {},
): Promise<void> {
  const config = await em.findOne(CurrencyFetchConfig, {
    id,
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
  })

  if (!config) {
    throw new Error('Fetch config not found')
  }

  await deps.fetchScheduleService?.removeForConfig(config.id)

  await em.remove(config).flush()
}
