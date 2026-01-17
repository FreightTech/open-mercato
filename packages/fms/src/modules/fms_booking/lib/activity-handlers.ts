/**
 * FMS Booking Module - Workflow Activity Handlers
 * Custom activity implementations for booking lifecycle workflow
 */

import type { EntityManager } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import { Booking } from '../data/entities'

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
 * Validate booking has required data before completion
 */
export const validateBooking = async (ctx: ActivityContext): Promise<ActivityResult> => {
  const { bookingId } = ctx.context

  if (!bookingId) {
    return {
      success: false,
      errors: ['Booking ID is required'],
    }
  }

  const booking = await ctx.em.findOne(
    Booking,
    { id: bookingId },
    { populate: ['legs', 'containers', 'cargo'] }
  )

  if (!booking) {
    return {
      success: false,
      errors: ['Booking not found'],
    }
  }

  const errors: string[] = []

  // Validation rules
  if (booking.legs.length === 0) {
    errors.push('At least one route leg is required')
  }

  if (booking.cargoType === 'fcl') {
    if (booking.containers.length === 0) {
      errors.push('FCL booking requires at least one container')
    }
  } else if (booking.cargoType === 'lcl') {
    if (booking.cargo.length === 0) {
      errors.push('LCL booking requires at least one cargo item')
    }
  }

  // Check that legs are sequentially numbered
  const legSequences = booking.legs.getItems().map((leg) => leg.legSequence).sort((a, b) => a - b)
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
      bookingId,
    }
  }

  // Update booking status
  booking.currentStep = 'validated'
  await ctx.em.flush()

  return {
    success: true,
    bookingId,
    validatedAt: new Date().toISOString(),
    legCount: booking.legs.length,
    containerCount: booking.containers.length,
    cargoCount: booking.cargo.length,
  }
}

/**
 * Generate unique booking number
 * Format: {TYPE}/{FCL|LCL}/{SEQUENCE}/{YEAR}/{COMPANY}
 * Example: EXP/FCL/00001/2026/ABC
 */
export const generateBookingNumber = async (ctx: ActivityContext): Promise<string> => {
  const { shipmentType, cargoType, organizationId, tenantId } = ctx.context
  const year = new Date().getFullYear()

  // Get next sequence number for this year and organization
  const connection = ctx.em.getConnection()
  const result = await connection.execute(
    `
    SELECT COALESCE(MAX(
      CAST(
        SUBSTRING(booking_number FROM '^[A-Z]+/[A-Z]+/([0-9]+)/') AS INTEGER
      )
    ), 0) + 1 as next_seq
    FROM fms_bookings
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
  const { bookingId } = ctx.context

  const booking = await ctx.em.findOne(
    Booking,
    { id: bookingId },
    { populate: ['containers', 'cargo'] }
  )

  if (!booking) {
    return {
      success: false,
      errors: ['Booking not found'],
    }
  }

  let totalGrossWeight = 0
  let totalVolume = 0

  if (booking.cargoType === 'fcl') {
    // Sum container weights
    for (const container of booking.containers.getItems()) {
      if (container.grossWeight) {
        totalGrossWeight += parseFloat(container.grossWeight)
      }
    }
  } else if (booking.cargoType === 'lcl') {
    // Sum cargo weights and volumes
    for (const cargo of booking.cargo.getItems()) {
      if (cargo.grossWeight) {
        totalGrossWeight += parseFloat(cargo.grossWeight)
      }
      if (cargo.volume) {
        totalVolume += parseFloat(cargo.volume)
      }
    }
  }

  // Update booking
  booking.totalGrossWeight = totalGrossWeight.toString()
  if (totalVolume > 0) {
    booking.totalVolume = totalVolume.toString()
  }

  await ctx.em.flush()

  return {
    success: true,
    bookingId,
    totalGrossWeight,
    totalVolume,
  }
}

/**
 * Emit booking event (placeholder - actual implementation depends on event system)
 */
export const emitBookingEvent = async (
  ctx: ActivityContext,
  eventType: string,
  payload: Record<string, any>
): Promise<ActivityResult> => {
  // TODO: Integrate with actual event system
  console.log(`[Booking Event] ${eventType}`, payload)

  return {
    success: true,
    eventType,
    payload,
    emittedAt: new Date().toISOString(),
  }
}

// Export all handlers
export default {
  validateBooking,
  generateBookingNumber,
  calculateTotals,
  emitBookingEvent,
}
