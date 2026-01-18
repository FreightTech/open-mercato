/**
 * FMS Projects Module - Workflow Activity Handlers
 * Custom activity implementations for project lifecycle workflow
 */

import type { EntityManager } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import { FmsProject } from '../data/entities'

export interface ActivityContext {
  em: EntityManager
  container: AwilixContainer
  context: Record<string, any>
  userId?: string
  tenantId?: string
  organizationId?: string
}

export interface ActivityResult {
  success: boolean
  [key: string]: any
}

/**
 * Validate project has required data before completion
 */
export const validateProject = async (ctx: ActivityContext): Promise<ActivityResult> => {
  const { projectId } = ctx.context

  if (!projectId) {
    return {
      success: false,
      errors: ['Project ID is required'],
    }
  }

  const project = await ctx.em.findOne(
    FmsProject,
    { id: projectId },
    { populate: ['legs', 'seaContainers', 'cargo'] }
  )

  if (!project) {
    return {
      success: false,
      errors: ['Project not found'],
    }
  }

  const errors: string[] = []

  // Validation rules
  if (project.legs.length === 0) {
    errors.push('At least one route leg is required')
  }

  if (project.cargoType === 'fcl') {
    if (project.seaContainers.length === 0) {
      errors.push('FCL project requires at least one container')
    }
  } else if (project.cargoType === 'lcl') {
    if (project.cargo.length === 0) {
      errors.push('LCL project requires at least one cargo item')
    }
  }

  // Check that legs are sequentially numbered
  const legSequences = project.legs.getItems().map((leg) => leg.legSequence).sort((a, b) => a - b)
  for (let i = 0; i < legSequences.length; i++) {
    if (legSequences[i] !== i + 1) {
      errors.push(`Route legs must be sequentially numbered. Missing leg ${i + 1}`)
      break
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      projectId,
    }
  }

  // Update project status
  project.currentStep = 'validated'
  await ctx.em.flush()

  return {
    success: true,
    projectId,
    validatedAt: new Date().toISOString(),
    legCount: project.legs.length,
    containerCount: project.seaContainers.length,
    cargoCount: project.cargo.length,
  }
}

/**
 * Generate unique project number
 * Format: {TYPE}/{FCL|LCL}/{SEQUENCE}/{YEAR}/{COMPANY}
 * Example: EXP/FCL/00001/2026/ABC
 */
export const generateProjectNumber = async (ctx: ActivityContext): Promise<string> => {
  const { shipmentType, cargoType, organizationId, tenantId } = ctx.context
  const year = new Date().getFullYear()

  // Get next sequence number for this year and organization
  const connection = ctx.em.getConnection()
  const result = await connection.execute(
    `
    SELECT COALESCE(MAX(
      CAST(
        SUBSTRING(project_number FROM '^[A-Z]+/[A-Z]+/([0-9]+)/') AS INTEGER
      )
    ), 0) + 1 as next_seq
    FROM fms_projects
    WHERE organization_id = $1
      AND EXTRACT(YEAR FROM created_at) = $2
      AND deleted_at IS NULL
    `,
    [organizationId, year]
  )

  const sequence = String(result[0]?.next_seq || 1).padStart(5, '0')

  // Get organization code (3-letter abbreviation)
  const orgResult = await connection.execute(
    `SELECT UPPER(SUBSTRING(name FROM 1 FOR 3)) as code FROM organizations WHERE id = $1`,
    [organizationId]
  )

  const orgCode = orgResult[0]?.code || 'ORG'

  // Format: TYPE/CARGO/SEQUENCE/YEAR/ORG
  return `${shipmentType}/${cargoType.toUpperCase()}/${sequence}/${year}/${orgCode}`
}

/**
 * Calculate total weight and volume from containers/cargo
 */
export const calculateTotals = async (ctx: ActivityContext): Promise<ActivityResult> => {
  const { projectId } = ctx.context

  const project = await ctx.em.findOne(
    FmsProject,
    { id: projectId },
    { populate: ['seaContainers', 'cargo'] }
  )

  if (!project) {
    return {
      success: false,
      errors: ['Project not found'],
    }
  }

  let totalGrossWeight = 0
  let totalVolume = 0

  if (project.cargoType === 'fcl') {
    // FCL doesn't track weight on sea containers anymore (per plan)
    // Weight is tracked on cargo items instead
  } else if (project.cargoType === 'lcl') {
    // Sum cargo weights and volumes
    for (const cargo of project.cargo.getItems()) {
      if (cargo.grossWeight) {
        totalGrossWeight += parseFloat(cargo.grossWeight)
      }
      if (cargo.volume) {
        totalVolume += parseFloat(cargo.volume)
      }
    }
  }

  // Update project
  project.totalGrossWeight = totalGrossWeight.toString()
  if (totalVolume > 0) {
    project.totalVolume = totalVolume.toString()
  }

  await ctx.em.flush()

  return {
    success: true,
    projectId,
    totalGrossWeight,
    totalVolume,
  }
}

/**
 * Emit project event (placeholder - actual implementation depends on event system)
 */
export const emitProjectEvent = async (
  ctx: ActivityContext,
  eventType: string,
  payload: Record<string, any>
): Promise<ActivityResult> => {
  // TODO: Integrate with actual event system
  console.log(`[Project Event] ${eventType}`, payload)

  return {
    success: true,
    eventType,
    payload,
    emittedAt: new Date().toISOString(),
  }
}

// Export all handlers
export default {
  validateProject,
  generateProjectNumber,
  calculateTotals,
  emitProjectEvent,
}
