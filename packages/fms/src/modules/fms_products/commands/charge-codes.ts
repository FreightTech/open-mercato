import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
  buildChanges,
  requireId,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { FmsChargeCode } from '../data/entities'
import type { FmsChargeCodeSnapshot, ChargeCodeUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadChargeCodeSnapshot,
  applyChargeCodeSnapshot,
  getUserIdFromAuth,
} from './shared'

const chargeUnitSchema = z.enum(['per_container', 'per_piece', 'one_time'])

const chargeCodeFieldSchemaValidator = z.record(
  z.string(),
  z.object({
    type: z.enum(['string', 'integer', 'number', 'boolean', 'date']),
    required: z.boolean(),
    label: z.string(),
    description: z.string().optional(),
    unit: z.string().optional(),
    options: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
        })
      )
      .optional(),
  })
)

const createChargeCodeSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50).regex(/^[A-Z_]+$/, 'Code must be uppercase letters and underscores only'),
  description: z.string().max(1000).optional().nullable(),
  chargeUnit: chargeUnitSchema,
  fieldSchema: chargeCodeFieldSchemaValidator.optional().nullable(),
  isActive: z.boolean().optional().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateChargeCodeSchema = z.object({
  id: z.string().uuid(),
  description: z.string().max(1000).optional().nullable(),
  chargeUnit: chargeUnitSchema.optional(),
  fieldSchema: chargeCodeFieldSchemaValidator.optional().nullable(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreateChargeCodeInput = z.infer<typeof createChargeCodeSchema>
type UpdateChargeCodeInput = z.infer<typeof updateChargeCodeSchema>

const createChargeCodeCommand: CommandHandler<CreateChargeCodeInput, { id: string }> = {
  id: 'fms_products.charge_codes.create',
  async execute(rawInput, ctx) {
    const input = createChargeCodeSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Check for unique code constraint
    const existing = await em.findOne(FmsChargeCode, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code: input.code,
      deletedAt: null,
    })
    if (existing) {
      throw new Error('Charge code already exists')
    }

    const chargeCode = em.create(FmsChargeCode, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code: input.code,
      description: input.description ?? null,
      chargeUnit: input.chargeUnit,
      fieldSchema: input.fieldSchema ?? null,
      isActive: input.isActive ?? true,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(chargeCode)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: chargeCode,
      identifiers: {
        id: chargeCode.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: chargeCode.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadChargeCodeSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadChargeCodeSnapshot(em, result.id)
    return {
      actionLabel: 'Create charge code',
      resourceKind: 'fms_products.charge_code',
      resourceId: result.id,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        },
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ChargeCodeUndoPayload>(logEntry)
    const chargeCodeId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!chargeCodeId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const chargeCode = await em.findOne(FmsChargeCode, { id: chargeCodeId })
    if (!chargeCode) return

    em.remove(chargeCode)
    await em.flush()
  },
}

const updateChargeCodeCommand: CommandHandler<UpdateChargeCodeInput, { id: string }> = {
  id: 'fms_products.charge_codes.update',
  async prepare(rawInput, ctx) {
    const input = updateChargeCodeSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadChargeCodeSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateChargeCodeSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const chargeCode = await em.findOne(FmsChargeCode, { id: input.id, deletedAt: null })
    const record = assertRecordFound(chargeCode, 'Charge code not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.description !== undefined) record.description = input.description
    if (input.chargeUnit !== undefined) record.chargeUnit = input.chargeUnit
    if (input.fieldSchema !== undefined) record.fieldSchema = input.fieldSchema
    if (input.isActive !== undefined) record.isActive = input.isActive

    record.updatedBy = input.updatedBy ?? getUserIdFromAuth(ctx)
    record.updatedAt = new Date()

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: {
        id: record.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsChargeCodeSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadChargeCodeSnapshot(em, result.id)

    const changeKeys = [
      'description',
      'chargeUnit',
      'fieldSchema',
      'isActive',
    ] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update charge code',
      resourceKind: 'fms_products.charge_code',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: {
        undo: {
          before,
          after: afterSnapshot ?? null,
        } satisfies ChargeCodeUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ChargeCodeUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyChargeCodeSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const chargeCode = await em.findOne(FmsChargeCode, { id: before.id })
    if (chargeCode) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: chargeCode,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deleteChargeCodeCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_products.charge_codes.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Charge code id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadChargeCodeSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Charge code id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const chargeCode = await em.findOne(FmsChargeCode, { id, deletedAt: null })
    const record = assertRecordFound(chargeCode, 'Charge code not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete
    record.deletedAt = new Date()
    record.updatedBy = getUserIdFromAuth(ctx)

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: record,
      identifiers: {
        id: record.id,
        organizationId: record.organizationId,
        tenantId: record.tenantId,
      },
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as FmsChargeCodeSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete charge code',
      resourceKind: 'fms_products.charge_code',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies ChargeCodeUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ChargeCodeUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyChargeCodeSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const chargeCode = await em.findOne(FmsChargeCode, { id: before.id })
    if (chargeCode) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: chargeCode,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createChargeCodeCommand)
registerCommand(updateChargeCodeCommand)
registerCommand(deleteChargeCodeCommand)

export { createChargeCodeCommand, updateChargeCodeCommand, deleteChargeCodeCommand }
