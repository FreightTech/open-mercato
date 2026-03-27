import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { requireId } from '@open-mercato/shared/lib/commands/helpers'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { InvoicingSettings, InvoicingKsefCredential } from '../data/entities'
import {
  updateSettingsSchema,
  createCredentialSchema,
  updateCredentialSchema,
} from '../data/validators'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  assertRecordFound,
  getUserIdFromAuth,
} from './shared'

// ========================================
// Update Settings Command (upsert)
// ========================================

type UpdateSettingsInput = z.infer<typeof updateSettingsSchema> & {
  organizationId: string
  tenantId: string
}

const updateSettingsCommand: CommandHandler<UpdateSettingsInput, { id: string }> = {
  id: 'invoicing.settings.update',
  async execute(rawInput, ctx) {
    const input = {
      organizationId: rawInput.organizationId,
      tenantId: rawInput.tenantId,
      ...updateSettingsSchema.parse(rawInput),
    }
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let settings = await em.findOne(InvoicingSettings, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
    })

    if (!settings) {
      settings = em.create(InvoicingSettings, {
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        ksefEnvironment: input.ksefEnvironment ?? 'test',
        ksefAutoSubmit: input.ksefAutoSubmit ?? false,
        ksefSessionMode: input.ksefSessionMode ?? 'batch',
        defaultSellerName: input.defaultSellerName ?? null,
        defaultSellerNip: input.defaultSellerNip ?? null,
        defaultSellerAddress: input.defaultSellerAddress ?? null,
        defaultSellerCountryCode: input.defaultSellerCountryCode ?? null,
        defaultSellerBankAccount: input.defaultSellerBankAccount ?? null,
        defaultPaymentMethod: input.defaultPaymentMethod ?? null,
        autoImportFromDocuments: input.autoImportFromDocuments ?? true,
        autoImportFromSales: input.autoImportFromSales ?? false,
        offlineMode: input.offlineMode ?? 'online',
      })
      em.persist(settings)
    } else {
      if (input.ksefEnvironment !== undefined) settings.ksefEnvironment = input.ksefEnvironment
      if (input.ksefAutoSubmit !== undefined) settings.ksefAutoSubmit = input.ksefAutoSubmit
      if (input.ksefSessionMode !== undefined) settings.ksefSessionMode = input.ksefSessionMode
      if (input.defaultSellerName !== undefined) settings.defaultSellerName = input.defaultSellerName
      if (input.defaultSellerNip !== undefined) settings.defaultSellerNip = input.defaultSellerNip
      if (input.defaultSellerAddress !== undefined) settings.defaultSellerAddress = input.defaultSellerAddress
      if (input.defaultSellerCountryCode !== undefined) settings.defaultSellerCountryCode = input.defaultSellerCountryCode
      if (input.defaultSellerBankAccount !== undefined) settings.defaultSellerBankAccount = input.defaultSellerBankAccount
      if (input.defaultPaymentMethod !== undefined) settings.defaultPaymentMethod = input.defaultPaymentMethod
      if (input.autoImportFromDocuments !== undefined) settings.autoImportFromDocuments = input.autoImportFromDocuments
      if (input.autoImportFromSales !== undefined) settings.autoImportFromSales = input.autoImportFromSales
      if (input.offlineMode !== undefined) settings.offlineMode = input.offlineMode
    }

    await em.flush()

    return { id: settings.id }
  },
  buildLog: async ({ result }) => {
    return {
      actionLabel: 'Update invoicing settings',
      resourceKind: 'invoicing.settings',
      resourceId: result.id,
      tenantId: null,
      organizationId: null,
    }
  },
}

// ========================================
// Create Credential Command
// ========================================

type CreateCredentialInput = z.infer<typeof createCredentialSchema>

const createCredentialCommand: CommandHandler<CreateCredentialInput, { id: string }> = {
  id: 'invoicing.credentials.create',
  async execute(rawInput, ctx) {
    const input = createCredentialSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const credential = em.create(InvoicingKsefCredential, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      nip: input.nip,
      authType: input.authType,
      ksefToken: input.ksefToken ?? null,
      certificatePem: input.certificatePem ?? null,
      privateKeyPem: input.privateKeyPem ?? null,
      environment: input.environment ?? 'test',
      label: input.label ?? null,
    })

    em.persist(credential)
    await em.flush()

    return { id: credential.id }
  },
  buildLog: async ({ result }) => {
    return {
      actionLabel: 'Create KSeF credential',
      resourceKind: 'invoicing.credential',
      resourceId: result.id,
      tenantId: null,
      organizationId: null,
    }
  },
}

// ========================================
// Update Credential Command
// ========================================

type UpdateCredentialInput = z.infer<typeof updateCredentialSchema> & { id: string }

const updateCredentialCommand: CommandHandler<UpdateCredentialInput, { id: string }> = {
  id: 'invoicing.credentials.update',
  async execute(rawInput, ctx) {
    const input = { id: rawInput.id, ...updateCredentialSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const credential = await em.findOne(InvoicingKsefCredential, { id: input.id })
    const record = assertRecordFound(credential, 'Credential not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.ksefToken !== undefined) record.ksefToken = input.ksefToken
    if (input.certificatePem !== undefined) record.certificatePem = input.certificatePem
    if (input.privateKeyPem !== undefined) record.privateKeyPem = input.privateKeyPem
    if (input.environment !== undefined) record.environment = input.environment
    if (input.isActive !== undefined) record.isActive = input.isActive
    if (input.label !== undefined) record.label = input.label

    await em.flush()

    return { id: record.id }
  },
  buildLog: async ({ result }) => {
    return {
      actionLabel: 'Update KSeF credential',
      resourceKind: 'invoicing.credential',
      resourceId: result.id,
      tenantId: null,
      organizationId: null,
    }
  },
}

// ========================================
// Delete Credential Command (hard delete)
// ========================================

const deleteCredentialCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'invoicing.credentials.delete',
  async execute(input, ctx) {
    const id = requireId(input, 'Credential id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const credential = await em.findOne(InvoicingKsefCredential, { id })
    const record = assertRecordFound(credential, 'Credential not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    em.remove(record)
    await em.flush()

    return { id }
  },
  buildLog: async ({ result }) => {
    return {
      actionLabel: 'Delete KSeF credential',
      resourceKind: 'invoicing.credential',
      resourceId: result.id,
      tenantId: null,
      organizationId: null,
    }
  },
}

// Register all commands
registerCommand(updateSettingsCommand)
registerCommand(createCredentialCommand)
registerCommand(updateCredentialCommand)
registerCommand(deleteCredentialCommand)

export {
  updateSettingsCommand,
  createCredentialCommand,
  updateCredentialCommand,
  deleteCredentialCommand,
}
