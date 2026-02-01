import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { Contractor, ContractorBankAccount } from '../../../data/entities'
import { contractorCreateSchema } from '../../../data/validators'

const updateBodySchema = contractorCreateSchema.partial()

const paramsSchema = z.object({
  id: z.string().uuid(),
})

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  const filterIds = scope?.filterIds
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.add(id)
    })
  } else {
    const fallbackOrgId = scope?.selectedId ?? auth.orgId
    if (typeof fallbackOrgId === 'string') {
      allowedOrgIds.add(fallbackOrgId)
    }
  }

  if (allowedOrgIds.size > 0) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  return filters
}

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid contractor id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const contractor = await em.findOne(Contractor, filters, {
    populate: ['addresses', 'contacts', 'bankAccounts', 'creditLimit'],
  })

  if (!contractor) return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })

  // Transform to response format
  const response = {
    id: contractor.id,
    name: contractor.name,
    shortName: contractor.shortName,
    officialName: contractor.officialName,
    parentId: contractor.parentId,
    taxId: contractor.taxId,
    regon: contractor.regon,
    krs: contractor.krs,
    registrationDate: contractor.registrationDate,
    pkdMainCode: contractor.pkdMainCode,
    pkdMainDescription: contractor.pkdMainDescription,
    isActive: contractor.isActive,
    createdAt: contractor.createdAt.toISOString(),
    updatedAt: contractor.updatedAt.toISOString(),
    addresses: contractor.addresses.getItems().map((addr) => ({
      id: addr.id,
      purpose: addr.purpose,
      addressLine: addr.addressLine,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country,
      isPrimary: addr.isPrimary,
      isActive: addr.isActive,
      createdAt: addr.createdAt.toISOString(),
      updatedAt: addr.updatedAt.toISOString(),
    })),
    contacts: contractor.contacts.getItems().map((contact) => ({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      isPrimary: contact.isPrimary,
      isActive: contact.isActive,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    })),
    roleTypeIds: contractor.roleTypeIds ?? [],
    bankAccounts: contractor.bankAccounts.getItems().map((account) => ({
      id: account.id,
      bankName: account.bankName,
      iban: account.iban,
      swiftBic: account.swiftBic,
      currencyCode: account.currencyCode,
      isPrimary: account.isPrimary,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    })),
    creditLimit: contractor.creditLimit ? {
      id: contractor.creditLimit.id,
      creditLimit: contractor.creditLimit.creditLimit,
      currencyCode: contractor.creditLimit.currencyCode,
      isUnlimited: contractor.creditLimit.isUnlimited,
      paymentDays: contractor.creditLimit.paymentDays,
      currentExposure: contractor.creditLimit.currentExposure,
      notes: contractor.creditLimit.notes,
      createdAt: contractor.creditLimit.createdAt.toISOString(),
      updatedAt: contractor.creditLimit.updatedAt.toISOString(),
    } : null,
  }

  return NextResponse.json(response)
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid contractor id' }, { status: 400 })

  const body = await req.json()
  const validation = updateBodySchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const contractor = await em.findOne(Contractor, filters)

  if (!contractor) return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })

  const data = validation.data

  if (data.name !== undefined) contractor.name = data.name
  if (data.shortName !== undefined) contractor.shortName = data.shortName
  if (data.officialName !== undefined) contractor.officialName = data.officialName
  if (data.parentId !== undefined) contractor.parentId = data.parentId
  if (data.taxId !== undefined) contractor.taxId = data.taxId
  if (data.regon !== undefined) contractor.regon = data.regon
  if (data.krs !== undefined) contractor.krs = data.krs
  if (data.registrationDate !== undefined) contractor.registrationDate = data.registrationDate
  if (data.pkdMainCode !== undefined) contractor.pkdMainCode = data.pkdMainCode
  if (data.pkdMainDescription !== undefined) contractor.pkdMainDescription = data.pkdMainDescription
  if (data.isActive !== undefined) contractor.isActive = data.isActive
  if (data.roleTypeIds !== undefined) contractor.roleTypeIds = data.roleTypeIds

  contractor.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    id: contractor.id,
    name: contractor.name,
    shortName: contractor.shortName,
    officialName: contractor.officialName,
    parentId: contractor.parentId,
    taxId: contractor.taxId,
    regon: contractor.regon,
    krs: contractor.krs,
    registrationDate: contractor.registrationDate,
    pkdMainCode: contractor.pkdMainCode,
    pkdMainDescription: contractor.pkdMainDescription,
    isActive: contractor.isActive,
    roleTypeIds: contractor.roleTypeIds ?? [],
    createdAt: contractor.createdAt.toISOString(),
    updatedAt: contractor.updatedAt.toISOString(),
  })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid contractor id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const contractor = await em.findOne(Contractor, filters)

  if (!contractor) return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })

  contractor.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
  PUT: { requireAuth: true, requireFeatures: ['contractors.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['contractors.delete'] },
}
