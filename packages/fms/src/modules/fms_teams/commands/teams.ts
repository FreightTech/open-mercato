import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureOrganizationScope } from '@open-mercato/shared/lib/commands/scope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { FmsTeam, FmsUserTeam, FmsUserContractorAssignment, FmsTeamContractorAssignment } from '../data/entities'
import {
  teamCreateSchema,
  teamUpdateSchema,
  userTeamUpdateSchema,
  userContractorAssignmentCreateSchema,
  teamContractorAssignmentCreateSchema,
  type TeamCreateInput,
  type TeamUpdateInput,
} from '../data/validators'

type ScopedTeamCreateInput = TeamCreateInput & {
  organizationId: string
  tenantId: string
}

type ScopedTeamUpdateInput = TeamUpdateInput & {
  id: string
  organizationId?: string
  tenantId?: string
}

function ensureTenantScope(ctx: CommandRuntimeContext, tenantId: string): void {
  const auth = ctx.auth
  if (!auth || !auth.tenantId || auth.tenantId !== tenantId) {
    throw new CrudHttpError(403, { error: 'Tenant scope mismatch' })
  }
}

const createTeamCommand: CommandHandler<ScopedTeamCreateInput, { teamId: string }> = {
  id: 'fms_teams.create',
  async execute(rawInput, ctx) {
    const parsed = teamCreateSchema.parse(rawInput)
    const organizationId = rawInput.organizationId
    const tenantId = rawInput.tenantId

    if (!organizationId || !tenantId) {
      throw new CrudHttpError(400, { error: 'organizationId and tenantId are required' })
    }

    ensureTenantScope(ctx, tenantId)
    ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Check for duplicate name
    const existing = await em.findOne(FmsTeam, {
      organizationId,
      tenantId,
      name: parsed.name,
      deletedAt: null,
    })
    if (existing) {
      throw new CrudHttpError(409, { error: 'A team with this name already exists' })
    }

    const team = em.create(FmsTeam, {
      organizationId,
      tenantId,
      name: parsed.name,
      isActive: parsed.isActive ?? true,
    })

    em.persist(team)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: team,
      identifiers: { id: team.id, tenantId, organizationId },
      indexer: { entityType: 'fms_teams:team' },
    })

    return { teamId: team.id }
  },
}

const updateTeamCommand: CommandHandler<ScopedTeamUpdateInput, { teamId: string }> = {
  id: 'fms_teams.update',
  async execute(rawInput, ctx) {
    const parsed = teamUpdateSchema.parse(rawInput)
    const id = rawInput.id

    if (!id) {
      throw new CrudHttpError(400, { error: 'Team id is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const team = await em.findOne(FmsTeam, { id, deletedAt: null })

    if (!team) {
      throw new CrudHttpError(404, { error: 'Team not found' })
    }

    ensureTenantScope(ctx, team.tenantId)
    ensureOrganizationScope(ctx, team.organizationId)

    // Check for duplicate name if name is being changed
    if (parsed.name !== undefined && parsed.name !== team.name) {
      const existing = await em.findOne(FmsTeam, {
        organizationId: team.organizationId,
        tenantId: team.tenantId,
        name: parsed.name,
        deletedAt: null,
        id: { $ne: id },
      })
      if (existing) {
        throw new CrudHttpError(409, { error: 'A team with this name already exists' })
      }
    }

    if (parsed.name !== undefined) team.name = parsed.name
    if (parsed.isActive !== undefined) team.isActive = parsed.isActive

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: team,
      identifiers: { id: team.id, tenantId: team.tenantId, organizationId: team.organizationId },
      indexer: { entityType: 'fms_teams:team' },
    })

    return { teamId: team.id }
  },
}

const deleteTeamCommand: CommandHandler<{ id: string }, { teamId: string }> = {
  id: 'fms_teams.delete',
  async execute(rawInput, ctx) {
    const id = rawInput.id

    if (!id) {
      throw new CrudHttpError(400, { error: 'Team id is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const team = await em.findOne(FmsTeam, { id, deletedAt: null })

    if (!team) {
      throw new CrudHttpError(404, { error: 'Team not found' })
    }

    ensureTenantScope(ctx, team.tenantId)
    ensureOrganizationScope(ctx, team.organizationId)

    // Soft delete the team
    team.deletedAt = new Date()

    // Clear team assignments for users
    await em.nativeUpdate(FmsUserTeam, { teamId: id }, { teamId: null })

    // Soft delete team contractor assignments
    await em.nativeUpdate(
      FmsTeamContractorAssignment,
      { teamId: id, deletedAt: null },
      { deletedAt: new Date() }
    )

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: team,
      identifiers: { id: team.id, tenantId: team.tenantId, organizationId: team.organizationId },
      indexer: { entityType: 'fms_teams:team' },
    })

    return { teamId: team.id }
  },
}

type UpdateUserTeamInput = {
  userId: string
  teamId: string | null
  organizationId: string
  tenantId: string
}

const updateUserTeamCommand: CommandHandler<UpdateUserTeamInput, { userId: string }> = {
  id: 'fms_teams.updateUserTeam',
  async execute(rawInput, ctx) {
    const { userId, teamId, organizationId, tenantId } = rawInput

    if (!userId || !organizationId || !tenantId) {
      throw new CrudHttpError(400, { error: 'userId, organizationId and tenantId are required' })
    }

    ensureTenantScope(ctx, tenantId)
    ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // If teamId provided, verify the team exists
    if (teamId) {
      const team = await em.findOne(FmsTeam, { id: teamId, organizationId, deletedAt: null })
      if (!team) {
        throw new CrudHttpError(404, { error: 'Team not found' })
      }
    }

    // Find existing user team record or create new one
    let userTeam = await em.findOne(FmsUserTeam, { userId, organizationId })

    if (userTeam) {
      userTeam.teamId = teamId
    } else {
      userTeam = em.create(FmsUserTeam, {
        userId,
        teamId,
        organizationId,
        tenantId,
      })
      em.persist(userTeam)
    }

    await em.flush()

    return { userId }
  },
}

type AssignUserContractorInput = {
  userId: string
  contractorId: string
  organizationId: string
  tenantId: string
}

const assignUserContractorCommand: CommandHandler<AssignUserContractorInput, { id: string }> = {
  id: 'fms_teams.assignUserContractor',
  async execute(rawInput, ctx) {
    const { userId, contractorId, organizationId, tenantId } = rawInput

    if (!userId || !contractorId || !organizationId || !tenantId) {
      throw new CrudHttpError(400, { error: 'userId, contractorId, organizationId and tenantId are required' })
    }

    ensureTenantScope(ctx, tenantId)
    ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Check if assignment already exists (including soft-deleted)
    const existing = await em.findOne(FmsUserContractorAssignment, {
      userId,
      contractorId,
      organizationId,
    })

    if (existing) {
      if (existing.deletedAt === null) {
        throw new CrudHttpError(409, { error: 'Assignment already exists' })
      }
      // Restore soft-deleted assignment
      existing.deletedAt = null
      await em.flush()
      return { id: existing.id }
    }

    const assignment = em.create(FmsUserContractorAssignment, {
      userId,
      contractorId,
      organizationId,
      tenantId,
    })

    em.persist(assignment)
    await em.flush()

    return { id: assignment.id }
  },
}

type RemoveUserContractorInput = {
  userId: string
  contractorId: string
  organizationId: string
  tenantId: string
}

const removeUserContractorCommand: CommandHandler<RemoveUserContractorInput, { ok: boolean }> = {
  id: 'fms_teams.removeUserContractor',
  async execute(rawInput, ctx) {
    const { userId, contractorId, organizationId, tenantId } = rawInput

    if (!userId || !contractorId || !organizationId || !tenantId) {
      throw new CrudHttpError(400, { error: 'userId, contractorId, organizationId and tenantId are required' })
    }

    ensureTenantScope(ctx, tenantId)
    ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const assignment = await em.findOne(FmsUserContractorAssignment, {
      userId,
      contractorId,
      organizationId,
      deletedAt: null,
    })

    if (!assignment) {
      throw new CrudHttpError(404, { error: 'Assignment not found' })
    }

    assignment.deletedAt = new Date()
    await em.flush()

    return { ok: true }
  },
}

type AssignTeamContractorInput = {
  teamId: string
  contractorId: string
  organizationId: string
  tenantId: string
}

const assignTeamContractorCommand: CommandHandler<AssignTeamContractorInput, { id: string }> = {
  id: 'fms_teams.assignTeamContractor',
  async execute(rawInput, ctx) {
    const { teamId, contractorId, organizationId, tenantId } = rawInput

    if (!teamId || !contractorId || !organizationId || !tenantId) {
      throw new CrudHttpError(400, { error: 'teamId, contractorId, organizationId and tenantId are required' })
    }

    ensureTenantScope(ctx, tenantId)
    ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify team exists
    const team = await em.findOne(FmsTeam, { id: teamId, organizationId, deletedAt: null })
    if (!team) {
      throw new CrudHttpError(404, { error: 'Team not found' })
    }

    // Check if assignment already exists (including soft-deleted)
    const existing = await em.findOne(FmsTeamContractorAssignment, {
      teamId,
      contractorId,
      organizationId,
    })

    if (existing) {
      if (existing.deletedAt === null) {
        throw new CrudHttpError(409, { error: 'Assignment already exists' })
      }
      // Restore soft-deleted assignment
      existing.deletedAt = null
      await em.flush()
      return { id: existing.id }
    }

    const assignment = em.create(FmsTeamContractorAssignment, {
      teamId,
      contractorId,
      organizationId,
      tenantId,
    })

    em.persist(assignment)
    await em.flush()

    return { id: assignment.id }
  },
}

type RemoveTeamContractorInput = {
  teamId: string
  contractorId: string
  organizationId: string
  tenantId: string
}

const removeTeamContractorCommand: CommandHandler<RemoveTeamContractorInput, { ok: boolean }> = {
  id: 'fms_teams.removeTeamContractor',
  async execute(rawInput, ctx) {
    const { teamId, contractorId, organizationId, tenantId } = rawInput

    if (!teamId || !contractorId || !organizationId || !tenantId) {
      throw new CrudHttpError(400, { error: 'teamId, contractorId, organizationId and tenantId are required' })
    }

    ensureTenantScope(ctx, tenantId)
    ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const assignment = await em.findOne(FmsTeamContractorAssignment, {
      teamId,
      contractorId,
      organizationId,
      deletedAt: null,
    })

    if (!assignment) {
      throw new CrudHttpError(404, { error: 'Assignment not found' })
    }

    assignment.deletedAt = new Date()
    await em.flush()

    return { ok: true }
  },
}

registerCommand(createTeamCommand)
registerCommand(updateTeamCommand)
registerCommand(deleteTeamCommand)
registerCommand(updateUserTeamCommand)
registerCommand(assignUserContractorCommand)
registerCommand(removeUserContractorCommand)
registerCommand(assignTeamContractorCommand)
registerCommand(removeTeamContractorCommand)
