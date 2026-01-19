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
import { Shipment, ShipmentTask, TaskStatus } from '../data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import type { ShipmentTaskSnapshot, TaskUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadTaskSnapshot,
  applyTaskSnapshot,
} from './shared'

const createTaskSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  shipmentId: z.string().uuid(),
  title: z.string(),
  description: z.string().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  assignedToId: z.string().uuid().optional().nullable(),
})

const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  assignedToId: z.string().uuid().optional().nullable(),
})

type CreateTaskInput = z.infer<typeof createTaskSchema>
type UpdateTaskInput = z.infer<typeof updateTaskSchema>

const createTaskCommand: CommandHandler<CreateTaskInput, { id: string }> = {
  id: 'shipments.tasks.create',
  async execute(rawInput, ctx) {
    const input = createTaskSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify shipment exists
    const shipment = await em.findOne(Shipment, {
      id: input.shipmentId,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
    })
    if (!shipment) {
      throw new Error('Shipment not found')
    }

    const task = em.create(ShipmentTask, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      shipmentId: input.shipmentId,
      title: input.title,
      description: input.description ?? undefined,
      status: input.status ?? TaskStatus.TODO,
      assignedTo: input.assignedToId ? em.getReference(User, input.assignedToId) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    em.persist(task)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: task,
      identifiers: {
        id: task.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: task.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadTaskSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadTaskSnapshot(em, result.id)
    return {
      actionLabel: 'Create task',
      resourceKind: 'shipments.task',
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
    const payload = extractUndoPayload<TaskUndoPayload>(logEntry)
    const taskId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!taskId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const task = await em.findOne(ShipmentTask, { id: taskId })
    if (!task) return

    em.remove(task)
    await em.flush()
  },
}

const updateTaskCommand: CommandHandler<UpdateTaskInput, { id: string }> = {
  id: 'shipments.tasks.update',
  async prepare(rawInput, ctx) {
    const input = updateTaskSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadTaskSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateTaskSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const task = await em.findOne(ShipmentTask, { id: input.id }, {
      populate: ['assignedTo'],
    })
    const record = assertRecordFound(task, 'Task not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.title !== undefined) record.title = input.title
    if (input.description !== undefined) record.description = input.description ?? undefined
    if (input.status !== undefined) record.status = input.status
    if (input.assignedToId !== undefined) {
      record.assignedTo = input.assignedToId ? em.getReference(User, input.assignedToId) : undefined
    }

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
    const before = snapshots.before as ShipmentTaskSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadTaskSnapshot(em, result.id)

    const changeKeys = ['title', 'description', 'status', 'assignedToId'] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update task',
      resourceKind: 'shipments.task',
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
        } satisfies TaskUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<TaskUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyTaskSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const task = await em.findOne(ShipmentTask, { id: before.id })
    if (task) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: task,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deleteTaskCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'shipments.tasks.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Task id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadTaskSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Task id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const task = await em.findOne(ShipmentTask, { id })
    const record = assertRecordFound(task, 'Task not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    em.remove(record)
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
    const before = snapshots.before as ShipmentTaskSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete task',
      resourceKind: 'shipments.task',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies TaskUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<TaskUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyTaskSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const task = await em.findOne(ShipmentTask, { id: before.id })
    if (task) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: task,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createTaskCommand)
registerCommand(updateTaskCommand)
registerCommand(deleteTaskCommand)

export { createTaskCommand, updateTaskCommand, deleteTaskCommand }
