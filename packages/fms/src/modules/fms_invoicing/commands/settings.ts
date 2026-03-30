import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { FmsInvoicingSettings } from '../data/entities'
import { updateSettingsSchema } from '../data/validators'
import {
  ensureTenantScope,
  ensureOrganizationScope,
} from './shared'

type UpdateSettingsInput = z.infer<typeof updateSettingsSchema> & {
  organizationId: string
  tenantId: string
}

const updateSettingsCommand: CommandHandler<UpdateSettingsInput, { id: string }> = {
  id: 'fms_invoicing.settings.update',
  async execute(rawInput, ctx) {
    const input = {
      organizationId: rawInput.organizationId,
      tenantId: rawInput.tenantId,
      ...updateSettingsSchema.parse(rawInput),
    }
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let settings = await em.findOne(FmsInvoicingSettings, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
    })

    if (!settings) {
      settings = em.create(FmsInvoicingSettings, {
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        defaultSellerName: input.defaultSellerName ?? null,
        defaultSellerNip: input.defaultSellerNip ?? null,
        defaultSellerAddress: input.defaultSellerAddress ?? null,
        defaultSellerCountryCode: input.defaultSellerCountryCode ?? null,
        defaultSellerBankAccount: input.defaultSellerBankAccount ?? null,
        defaultPaymentMethod: input.defaultPaymentMethod ?? null,
        autoImportFromDocuments: input.autoImportFromDocuments ?? true,
        autoImportFromSales: input.autoImportFromSales ?? false,
      })
      em.persist(settings)
    } else {
      if (input.defaultSellerName !== undefined) settings.defaultSellerName = input.defaultSellerName
      if (input.defaultSellerNip !== undefined) settings.defaultSellerNip = input.defaultSellerNip
      if (input.defaultSellerAddress !== undefined) settings.defaultSellerAddress = input.defaultSellerAddress
      if (input.defaultSellerCountryCode !== undefined) settings.defaultSellerCountryCode = input.defaultSellerCountryCode
      if (input.defaultSellerBankAccount !== undefined) settings.defaultSellerBankAccount = input.defaultSellerBankAccount
      if (input.defaultPaymentMethod !== undefined) settings.defaultPaymentMethod = input.defaultPaymentMethod
      if (input.autoImportFromDocuments !== undefined) settings.autoImportFromDocuments = input.autoImportFromDocuments
      if (input.autoImportFromSales !== undefined) settings.autoImportFromSales = input.autoImportFromSales
    }

    await em.flush()

    return { id: settings.id }
  },
  buildLog: async ({ result }) => {
    return {
      actionLabel: 'Update invoicing settings',
      resourceKind: 'fms_invoicing.settings',
      resourceId: result.id,
      tenantId: null,
      organizationId: null,
    }
  },
}

registerCommand(updateSettingsCommand)

export { updateSettingsCommand }
