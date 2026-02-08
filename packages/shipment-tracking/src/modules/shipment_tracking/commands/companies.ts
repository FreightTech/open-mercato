import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/core'
import { ShipmentTrackingCompany } from '../data/entities'
import type { CompanyCreateInput, CompanyUpdateInput } from '../data/validators'

function ensureScope(ctx: CommandRuntimeContext, tenantId: string, organizationId: string) {
  if (ctx.auth?.tenantId && ctx.auth.tenantId !== tenantId) {
    throw new Error('Tenant mismatch')
  }
  if (!ctx.auth?.isSuperAdmin && ctx.auth?.organizationId && ctx.auth.organizationId !== organizationId) {
    throw new Error('Organization mismatch')
  }
}

const createCompany: CommandHandler<CompanyCreateInput, { id: string }> = {
  id: 'shipment_tracking.company.create',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()

    const company = em.create(ShipmentTrackingCompany, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
    })

    await em.flush()

    return { id: company.id }
  },
}

const updateCompany: CommandHandler<CompanyUpdateInput, { id: string }> = {
  id: 'shipment_tracking.company.update',

  async execute(input, ctx) {
    const em = ctx.container.resolve<EntityManager>('em').fork()

    const company = await em.findOne(ShipmentTrackingCompany, { id: input.id, deletedAt: null })
    if (!company) throw new Error('Company not found')

    ensureScope(ctx, company.tenantId, company.organizationId)

    if (input.name !== undefined) company.name = input.name
    if (input.description !== undefined) company.description = input.description
    if (input.isActive !== undefined) company.isActive = input.isActive

    await em.flush()

    return { id: company.id }
  },
}

const deleteCompany: CommandHandler<{ id: string; tenantId: string; organizationId: string }, { id: string }> = {
  id: 'shipment_tracking.company.delete',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()

    const company = await em.findOne(ShipmentTrackingCompany, { id: input.id, deletedAt: null })
    if (!company) throw new Error('Company not found')

    company.deletedAt = new Date()
    await em.flush()

    return { id: company.id }
  },
}

registerCommand(createCompany)
registerCommand(updateCompany)
registerCommand(deleteCompany)
