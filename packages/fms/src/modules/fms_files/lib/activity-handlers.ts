/**
 * FMS Files Module - Workflow Activity Handlers
 * Custom activity implementations for file lifecycle workflow
 */

import type { EntityManager } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import { FmsFile } from '../data/entities'

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
 * Validate file has required data before completion
 */
export const validateFile = async (ctx: ActivityContext): Promise<ActivityResult> => {
  const { fileId } = ctx.context

  if (!fileId) {
    return {
      success: false,
      errors: ['File ID is required'],
    }
  }

  const file = await ctx.em.findOne(
    FmsFile,
    { id: fileId },
    { populate: ['legs', 'containers', 'cargo'] }
  )

  if (!file) {
    return {
      success: false,
      errors: ['File not found'],
    }
  }

  const errors: string[] = []

  // Validation rules
  if (file.legs.length === 0) {
    errors.push('At least one route leg is required')
  }

  if (file.cargoType === 'fcl') {
    if (file.containers.length === 0) {
      errors.push('FCL file requires at least one container')
    }
  } else if (file.cargoType === 'lcl') {
    if (file.cargo.length === 0) {
      errors.push('LCL file requires at least one cargo item')
    }
  }

  // Check that legs are sequentially numbered
  const legSequences = file.legs.getItems().map((leg) => leg.legSequence).sort((a, b) => a - b)
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
      fileId,
    }
  }

  // Update file status
  file.currentStep = 'validated'
  await ctx.em.flush()

  return {
    success: true,
    fileId,
    validatedAt: new Date().toISOString(),
    legCount: file.legs.length,
    containerCount: file.containers.length,
    cargoCount: file.cargo.length,
  }
}

/**
 * Generate unique file number
 * Format: {TYPE}/{FCL|LCL}/{SEQUENCE}/{YEAR}/{COMPANY}
 * Example: EXP/FCL/00001/2026/ABC
 */
export const generateFileNumber = async (ctx: ActivityContext): Promise<string> => {
  const { shipmentType, cargoType, organizationId, tenantId } = ctx.context
  const year = new Date().getFullYear()

  // Get next sequence number for this year and organization
  const connection = ctx.em.getConnection()
  const result = await connection.execute(
    `
    SELECT COALESCE(MAX(
      CAST(
        SUBSTRING(file_number FROM '^[A-Z]+/[A-Z]+/([0-9]+)/') AS INTEGER
      )
    ), 0) + 1 as next_seq
    FROM fms_files
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
  const { fileId } = ctx.context

  const file = await ctx.em.findOne(
    FmsFile,
    { id: fileId },
    { populate: ['containers', 'cargo'] }
  )

  if (!file) {
    return {
      success: false,
      errors: ['File not found'],
    }
  }

  let totalGrossWeight = 0
  let totalVolume = 0

  if (file.cargoType === 'fcl') {
    // Sum container weights
    for (const container of file.containers.getItems()) {
      if (container.grossWeight) {
        totalGrossWeight += parseFloat(container.grossWeight)
      }
    }
  } else if (file.cargoType === 'lcl') {
    // Sum cargo weights and volumes
    for (const cargo of file.cargo.getItems()) {
      if (cargo.grossWeight) {
        totalGrossWeight += parseFloat(cargo.grossWeight)
      }
      if (cargo.volume) {
        totalVolume += parseFloat(cargo.volume)
      }
    }
  }

  // Update file
  file.totalGrossWeight = totalGrossWeight.toString()
  if (totalVolume > 0) {
    file.totalVolume = totalVolume.toString()
  }

  await ctx.em.flush()

  return {
    success: true,
    fileId,
    totalGrossWeight,
    totalVolume,
  }
}

/**
 * Emit file event (placeholder - actual implementation depends on event system)
 */
export const emitFileEvent = async (
  ctx: ActivityContext,
  eventType: string,
  payload: Record<string, any>
): Promise<ActivityResult> => {
  // TODO: Integrate with actual event system
  console.log(`[File Event] ${eventType}`, payload)

  return {
    success: true,
    eventType,
    payload,
    emittedAt: new Date().toISOString(),
  }
}

// Export all handlers
export default {
  validateFile,
  generateFileNumber,
  calculateTotals,
  emitFileEvent,
}
