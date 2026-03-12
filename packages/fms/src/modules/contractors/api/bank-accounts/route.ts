import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { ContractorBankAccount } from '../../data/entities'
import { bankAccountCreateSchema, bankAccountUpdateSchema, bankAccountBatchCreateSchema } from '../../data/validators'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { withScopedPayload } from '@open-mercato/shared/lib/api/scoped'

const rawBodySchema = z.object({}).passthrough()

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(50),
    contractorId: z.string().uuid().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
  POST: { requireAuth: true, requireFeatures: ['contractors.edit'] },
  PUT: { requireAuth: true, requireFeatures: ['contractors.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['contractors.edit'] },
}

export const metadata = routeMetadata

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: ContractorBankAccount,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  list: {
    schema: listSchema,
    fields: [
      'id',
      'contractor_id',
      'bank_name',
      'iban',
      'swift_bic',
      'currency_code',
      'is_primary',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      bankName: 'bank_name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query: z.infer<typeof listSchema>) => {
      const filters: Record<string, unknown> = {}
      if (query.contractorId) filters.contractor_id = { $eq: query.contractorId }
      return filters
    },
    transformItem: (item: Record<string, unknown>) => ({
      id: item.id,
      contractorId: item.contractor_id,
      bankName: item.bank_name ?? null,
      iban: item.iban ?? null,
      swiftBic: item.swift_bic ?? null,
      currencyCode: item.currency_code ?? 'USD',
      isPrimary: item.is_primary ?? false,
      organizationId: item.organization_id,
      tenantId: item.tenant_id,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }),
  },
  actions: {
    create: {
      commandId: 'contractors.bank-accounts.batch-create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)

        // Always use batch create - wrap single account in array if needed
        if (scoped.accounts && Array.isArray(scoped.accounts)) {
          return {
            ...bankAccountBatchCreateSchema.parse(scoped),
            contractorId: scoped.contractorId,
          }
        }

        // Single account - wrap in array for batch create
        return {
          accounts: [bankAccountCreateSchema.parse(scoped)],
          contractorId: scoped.contractorId,
        }
      },
      response: ({ result }) => {
        if (result?.bankAccountIds) {
          return { ids: result.bankAccountIds }
        }
        return { id: result?.bankAccountId ?? result?.id ?? null }
      },
      status: 201,
    },
    update: {
      commandId: 'contractors.bank-accounts.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)
        return bankAccountUpdateSchema.extend({
          id: z.string().uuid(),
        }).parse(scoped)
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'contractors.bank-accounts.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id =
          parsed?.body?.id ??
          parsed?.id ??
          parsed?.query?.id ??
          (ctx.request ? new URL(ctx.request.url).searchParams.get('id') : null)
        if (!id) throw new CrudHttpError(400, { error: translate('contractors.validation.bankAccountIdRequired', 'Bank account id is required') })
        return { id }
      },
      response: () => ({ ok: true }),
    },
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
