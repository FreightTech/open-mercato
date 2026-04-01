/**
 * FMS File Demurrage & Detention Calculator
 *
 * Pure functions that compute D&D exposure from leg timestamps and free time.
 *
 * - Demurrage: charged when container stays at port after vessel arrival (ATA)
 *   beyond the agreed free time. Starts at ATA, ends when container is picked up
 *   (next leg's departure).
 * - Detention: charged when container is kept outside the port beyond free time.
 *   Starts when container leaves port (next leg's departure), ends when returned
 *   (next leg's arrival) or today if still out.
 *
 * Called at query time (not stored). Side-effect-free.
 */

import type { LegTimestampEntry } from '../data/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DemDetType = 'demurrage' | 'detention'
export type DemDetStatus = 'within_free_time' | 'approaching' | 'overdue'

export interface DemDetExposure {
  legId: string
  legSequence: number
  type: DemDetType
  freeTimeDays: number
  elapsedDays: number
  overdueDays: number
  startDate: string
  endDate: string | null
  status: DemDetStatus
}

type LegInput = {
  id: string
  legSequence: number
  type: string
  ataTimestamps?: LegTimestampEntry[] | null
  atdTimestamps?: LegTimestampEntry[] | null
  demFreeTime?: number | null
  detFreeTime?: number | null
}

type UnitLegInput = {
  unitId: string
  legId: string
  atd?: string | null
  ata?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000
const APPROACHING_THRESHOLD_DAYS = 2

function getLatestTimestamp(entries: LegTimestampEntry[] | null | undefined): string | null {
  if (!entries?.length) return null
  const latest = entries.reduce((best, entry) =>
    entry.updatedAt >= best.updatedAt ? entry : best
  )
  return latest.value
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function daysBetween(startIso: string, endDate: Date): number {
  const start = parseDate(startIso)
  if (!start) return 0
  return Math.max(0, Math.floor((endDate.getTime() - start.getTime()) / MS_PER_DAY))
}

function resolveDemDetStatus(elapsedDays: number, freeTimeDays: number): DemDetStatus {
  if (elapsedDays > freeTimeDays) return 'overdue'
  if (elapsedDays >= freeTimeDays - APPROACHING_THRESHOLD_DAYS) return 'approaching'
  return 'within_free_time'
}

/**
 * Find the earliest pickup date from the next leg's unit-level assignments.
 * For TRUCK next legs, timestamps live on FmsFileUnitLeg as plain text (atd/ata).
 * For SHIP/RAIL/AIR next legs, timestamps live on FmsFileLeg as SCD arrays.
 */
function findNextLegPickupDate(
  nextLeg: LegInput | undefined,
  unitLegs: UnitLegInput[],
): Date | null {
  if (!nextLeg) return null

  if (nextLeg.type === 'TRUCK') {
    // TRUCK: timestamps are on unit-level assignments
    const nextUnitLegs = unitLegs.filter((ul) => ul.legId === nextLeg.id)
    const pickupDates = nextUnitLegs
      .map((ul) => ul.atd ? parseDate(ul.atd) : null)
      .filter((d): d is Date => d !== null)
    if (pickupDates.length === 0) return null
    // Use earliest pickup across all units
    return pickupDates.reduce((earliest, d) => d < earliest ? d : earliest)
  }

  // Non-TRUCK: timestamps are SCD arrays on the leg itself
  const atd = getLatestTimestamp(nextLeg.atdTimestamps)
  return atd ? parseDate(atd) : null
}

/**
 * Find the delivery date from the next leg's unit-level assignments.
 * Used as the end of detention (container returned).
 */
function findNextLegDeliveryDate(
  nextLeg: LegInput | undefined,
  unitLegs: UnitLegInput[],
): Date | null {
  if (!nextLeg) return null

  if (nextLeg.type === 'TRUCK') {
    const nextUnitLegs = unitLegs.filter((ul) => ul.legId === nextLeg.id)
    const deliveryDates = nextUnitLegs
      .map((ul) => ul.ata ? parseDate(ul.ata) : null)
      .filter((d): d is Date => d !== null)
    if (deliveryDates.length === 0) return null
    // Use latest delivery across all units
    return deliveryDates.reduce((latest, d) => d > latest ? d : latest)
  }

  const ata = getLatestTimestamp(nextLeg.ataTimestamps)
  return ata ? parseDate(ata) : null
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function computeDemDetExposure(
  legs: LegInput[],
  unitLegs: UnitLegInput[] = [],
  now: Date = new Date(),
): DemDetExposure[] {
  const exposures: DemDetExposure[] = []

  for (const leg of legs) {
    // D&D only applies to SHIP and RAIL legs
    if (leg.type !== 'SHIP' && leg.type !== 'RAIL') continue

    const ata = getLatestTimestamp(leg.ataTimestamps)
    if (!ata) continue

    // Find the next leg in sequence (the pickup/onward leg)
    const nextLeg = legs.find((l) => l.legSequence === leg.legSequence + 1)
    const pickupDate = findNextLegPickupDate(nextLeg, unitLegs)
    const deliveryDate = findNextLegDeliveryDate(nextLeg, unitLegs)

    // Demurrage: starts at ATA, ends when container is picked up (next leg departure)
    if (leg.demFreeTime != null && leg.demFreeTime > 0) {
      const endDate = pickupDate ?? now
      const elapsed = daysBetween(ata, endDate)
      const overdue = Math.max(0, elapsed - leg.demFreeTime)

      exposures.push({
        legId: leg.id,
        legSequence: leg.legSequence,
        type: 'demurrage',
        freeTimeDays: leg.demFreeTime,
        elapsedDays: elapsed,
        overdueDays: overdue,
        startDate: ata,
        endDate: pickupDate ? pickupDate.toISOString() : null,
        status: resolveDemDetStatus(elapsed, leg.demFreeTime),
      })
    }

    // Detention: starts when container leaves port (next leg departure),
    // ends when container is returned (next leg arrival) or today if still out
    if (leg.detFreeTime != null && leg.detFreeTime > 0 && pickupDate) {
      const endDate = deliveryDate ?? now
      const pickupIso = pickupDate.toISOString()
      const elapsed = daysBetween(pickupIso, endDate)
      const overdue = Math.max(0, elapsed - leg.detFreeTime)

      exposures.push({
        legId: leg.id,
        legSequence: leg.legSequence,
        type: 'detention',
        freeTimeDays: leg.detFreeTime,
        elapsedDays: elapsed,
        overdueDays: overdue,
        startDate: pickupIso,
        endDate: deliveryDate ? deliveryDate.toISOString() : null,
        status: resolveDemDetStatus(elapsed, leg.detFreeTime),
      })
    }
  }

  return exposures
}
