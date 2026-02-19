import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { Contractor, ContractorContact, ContractorAddress } from '@open-mercato/fms/modules/contractors/data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
  PUT: { requireAuth: true, requireFeatures: ['contractors.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['contractors.delete'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const updateContractorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  shortName: z.string().max(100).optional().nullable(),
  officialName: z.string().max(255).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  regon: z.string().max(20).optional().nullable(),
  krs: z.string().max(20).optional().nullable(),
  registrationDate: z.string().optional().nullable(),
  pkdMainCode: z.string().max(10).optional().nullable(),
  pkdMainDescription: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid contractor id' }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const knex = em.getKnex()

  // Use tenant-only scoping for contractors (shared across orgs within tenant)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    tenantId: auth.tenantId,
  }

  const contractor = await em.findOne(Contractor, filters, {
    populate: ['contacts', 'addresses', 'bankAccounts', 'creditLimit', 'paymentTerms'],
  })

  if (!contractor) return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })

  // Get RFQ and Offer counts
  const [rfqCountResult, offerCountResult] = await Promise.all([
    knex('frc_rfqs')
      .where('account_id', contractor.id)
      .whereNull('deleted_at')
      .count('* as count')
      .first(),
    knex('frc_offers')
      .where('carrier_id', contractor.id)
      .whereNull('deleted_at')
      .count('* as count')
      .first(),
  ])

  return NextResponse.json({
    id: contractor.id,
    name: contractor.name,
    shortName: contractor.shortName ?? null,
    officialName: contractor.officialName ?? null,
    taxId: contractor.taxId ?? null,
    regon: contractor.regon ?? null,
    krs: contractor.krs ?? null,
    registrationDate: contractor.registrationDate ?? null,
    pkdMainCode: contractor.pkdMainCode ?? null,
    pkdMainDescription: contractor.pkdMainDescription ?? null,
    isActive: contractor.isActive,
    roleTypeIds: contractor.roleTypeIds ?? [],
    contacts: contractor.contacts.getItems().map((c) => ({
      id: c.id,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      isPrimary: c.isPrimary,
      isActive: c.isActive,
    })),
    addresses: contractor.addresses.getItems().map((a) => ({
      id: a.id,
      purpose: a.purpose,
      addressLine: a.addressLine ?? null,
      city: a.city ?? null,
      state: a.state ?? null,
      postalCode: a.postalCode ?? null,
      country: a.country ?? null,
      isPrimary: a.isPrimary,
      isActive: a.isActive,
    })),
    bankAccounts: contractor.bankAccounts.getItems().map((ba) => ({
      id: ba.id,
      bankName: ba.bankName ?? null,
      iban: ba.iban ?? null,
      swiftBic: ba.swiftBic ?? null,
      currencyCode: ba.currencyCode,
      isPrimary: ba.isPrimary,
    })),
    creditLimit: contractor.creditLimit
      ? {
          id: contractor.creditLimit.id,
          creditLimit: contractor.creditLimit.creditLimit,
          currencyCode: contractor.creditLimit.currencyCode,
          isUnlimited: contractor.creditLimit.isUnlimited,
          paymentDays: contractor.creditLimit.paymentDays,
          currentExposure: contractor.creditLimit.currentExposure,
          notes: contractor.creditLimit.notes ?? null,
        }
      : null,
    paymentTerms: contractor.paymentTerms
      ? {
          id: contractor.paymentTerms.id,
          paymentDays: contractor.paymentTerms.paymentDays,
          paymentMethod: contractor.paymentTerms.paymentMethod ?? null,
          currencyCode: contractor.paymentTerms.currencyCode,
        }
      : null,
    rfqsCount: Number(rfqCountResult?.count ?? 0),
    offersCount: Number(offerCountResult?.count ?? 0),
    organizationId: contractor.organizationId,
    tenantId: contractor.tenantId,
    createdAt: contractor.createdAt,
    updatedAt: contractor.updatedAt,
  })
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid contractor id' }, { status: 400 })

  const body = await req.json()
  const validation = updateContractorSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Use tenant-only scoping for contractors (shared across orgs within tenant)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    tenantId: auth.tenantId,
  }

  const contractor = await em.findOne(Contractor, filters)

  if (!contractor) return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })

  // Update fields
  const data = validation.data
  if (data.name !== undefined) contractor.name = data.name
  if (data.shortName !== undefined) contractor.shortName = data.shortName
  if (data.officialName !== undefined) contractor.officialName = data.officialName
  if (data.taxId !== undefined) contractor.taxId = data.taxId
  if (data.regon !== undefined) contractor.regon = data.regon
  if (data.krs !== undefined) contractor.krs = data.krs
  if (data.registrationDate !== undefined) contractor.registrationDate = data.registrationDate
  if (data.pkdMainCode !== undefined) contractor.pkdMainCode = data.pkdMainCode
  if (data.pkdMainDescription !== undefined) contractor.pkdMainDescription = data.pkdMainDescription
  if (data.isActive !== undefined) contractor.isActive = data.isActive

  contractor.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({ id: contractor.id, name: contractor.name })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid contractor id' }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Use tenant-only scoping for contractors (shared across orgs within tenant)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    tenantId: auth.tenantId,
  }

  const contractor = await em.findOne(Contractor, filters)

  if (!contractor) return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })

  // Soft delete
  contractor.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
