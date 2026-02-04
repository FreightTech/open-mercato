import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { ContractorSopComment, Contractor } from '../data/entities'
import {
  sopCommentCreateSchema,
  sopCommentUpdateSchema,
  type SopCommentCreateInput,
  type SopCommentUpdateInput,
} from '../data/validators'

type SopCommentCreateCommandInput = SopCommentCreateInput & {
  contractorId: string
  authorUserId?: string | null
  authorName?: string | null
}

type SopCommentUpdateCommandInput = SopCommentUpdateInput & {
  id: string
}

const createSopCommentCommand: CommandHandler<SopCommentCreateCommandInput, { commentId: string }> = {
  id: 'contractors.sop-comments.create',
  async execute(rawInput, ctx) {
    const parsed = sopCommentCreateSchema.parse(rawInput)
    const contractorId = rawInput.contractorId

    if (!contractorId) {
      throw new CrudHttpError(400, { error: 'contractorId is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const contractor = await em.findOne(Contractor, { id: contractorId, deletedAt: null })
    if (!contractor) {
      throw new CrudHttpError(404, { error: 'Contractor not found' })
    }

    const comment = em.create(ContractorSopComment, {
      organizationId: contractor.organizationId,
      tenantId: contractor.tenantId,
      contractor,
      category: parsed.category,
      body: parsed.body,
      isPinned: parsed.isPinned ?? false,
      authorUserId: rawInput.authorUserId ?? null,
      authorName: rawInput.authorName ?? null,
    })

    em.persist(comment)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: comment,
      identifiers: { id: comment.id, tenantId: contractor.tenantId, organizationId: contractor.organizationId },
    })

    return { commentId: comment.id }
  },
}

const updateSopCommentCommand: CommandHandler<SopCommentUpdateCommandInput, { commentId: string }> = {
  id: 'contractors.sop-comments.update',
  async execute(rawInput, ctx) {
    const parsed = sopCommentUpdateSchema.parse(rawInput)
    const id = rawInput.id

    if (!id) {
      throw new CrudHttpError(400, { error: 'Comment id is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const comment = await em.findOne(ContractorSopComment, { id, deletedAt: null })

    if (!comment) {
      throw new CrudHttpError(404, { error: 'Comment not found' })
    }

    if (parsed.category !== undefined) comment.category = parsed.category
    if (parsed.body !== undefined) comment.body = parsed.body
    if (parsed.isPinned !== undefined) comment.isPinned = parsed.isPinned

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: comment,
      identifiers: { id: comment.id, tenantId: comment.tenantId, organizationId: comment.organizationId },
    })

    return { commentId: comment.id }
  },
}

const deleteSopCommentCommand: CommandHandler<{ id: string }, { commentId: string }> = {
  id: 'contractors.sop-comments.delete',
  async execute(rawInput, ctx) {
    const id = rawInput.id

    if (!id) {
      throw new CrudHttpError(400, { error: 'Comment id is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const comment = await em.findOne(ContractorSopComment, { id, deletedAt: null })

    if (!comment) {
      throw new CrudHttpError(404, { error: 'Comment not found' })
    }

    const tenantId = comment.tenantId
    const organizationId = comment.organizationId

    // Soft delete
    comment.deletedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: { id } as ContractorSopComment,
      identifiers: { id, tenantId, organizationId },
    })

    return { commentId: id }
  },
}

registerCommand(createSopCommentCommand)
registerCommand(updateSopCommentCommand)
registerCommand(deleteSopCommentCommand)
