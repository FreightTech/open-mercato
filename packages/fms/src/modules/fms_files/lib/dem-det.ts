/**
 * FMS File Demurrage & Detention Calculator
 *
 * Pure functions that compute D&D exposure from leg timestamps and free time.
 *
 * - Demurrage: charged when container stays at port after vessel arrival (ATA)
 *   beyond the agreed free time. Starts at ATA, ends when container is picked up
 *   (next leg's departure). Computed per-unit for multi-unit files.
 * - Detention: charged when container is kept outside the port beyond free time.
 *   Starts when container leaves port (next leg's departure), ends when empty
 *   container is returned to depot (TRUCK: dropoffTime; non-TRUCK: next leg's
 *   arrival) or today if still out. Computed per-unit.
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
  unitId: string | null
  containerNumber: string | null
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
  dropoffTime?: string | null
}

type UnitInput = {
  id: string
  containerNumber?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000
const APPROACHING_THRESHOLD_DAYS = 2

function getLatestTimestamp(entries: LegTimestampEntry[] | null | undefined): string | null {
  if (!entries?.length) return null
  return entries.at(-1)!.value
}

/** Parse a date string, normalizing "YYYY-MM-DD HH:mm" (no TZ) to UTC */
function parseDate(value: string): Date | null {
  // TRUCK timestamps are stored as "YYYY-MM-DD HH:mm" without timezone.
  // new Date("2026-03-10 00:00") treats this as local time, causing
  // timezone-dependent results. Normalize by replacing space with 'T' and
  // appending 'Z' so it's parsed as UTC consistently.
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(value)
    ? value.replace(/\s+/, 'T') + ':00Z'
    : value
  const d = new Date(normalized)
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

/** Resolve pickup/delivery/dropoff dates for a specific unit on the next leg.
 *  - pickup: when the container left the port (ATD)
 *  - delivery: when the container arrived at destination (ATA)
 *  - dropoff: when the empty container was returned to depot (dropoffTime, TRUCK only)
 *    For non-TRUCK legs, dropoff falls back to ATA (no separate return event).
 */
function resolveUnitDates(
  unitId: string,
  nextLeg: LegInput | undefined,
  unitLegs: UnitLegInput[],
): { pickup: Date | null; delivery: Date | null; dropoff: Date | null } {
  if (!nextLeg) return { pickup: null, delivery: null, dropoff: null }

  if (nextLeg.type === 'TRUCK') {
    const ul = unitLegs.find((u) => u.legId === nextLeg.id && u.unitId === unitId)
    return {
      pickup: ul?.atd ? parseDate(ul.atd) : null,
      delivery: ul?.ata ? parseDate(ul.ata) : null,
      dropoff: ul?.dropoffTime ? parseDate(ul.dropoffTime) : null,
    }
  }

  // Non-TRUCK: shared leg-level timestamps apply to all units
  const atd = getLatestTimestamp(nextLeg.atdTimestamps)
  const ata = getLatestTimestamp(nextLeg.ataTimestamps)
  const ataDate = ata ? parseDate(ata) : null
  return {
    pickup: atd ? parseDate(atd) : null,
    delivery: ataDate,
    dropoff: ataDate, // no separate return event for non-TRUCK
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function computeDemDetExposure(
  legs: LegInput[],
  unitLegs: UnitLegInput[] = [],
  units: UnitInput[] = [],
  now: Date = new Date(),
): DemDetExposure[] {
  const exposures: DemDetExposure[] = []
  const unitById = new Map(units.map((u) => [u.id, u]))

  for (const leg of legs) {
    // D&D only applies to SHIP and RAIL legs
    if (leg.type !== 'SHIP' && leg.type !== 'RAIL') continue

    const ata = getLatestTimestamp(leg.ataTimestamps)
    if (!ata) continue

    const hasDemFreeTime = leg.demFreeTime != null && leg.demFreeTime > 0
    const hasDetFreeTime = leg.detFreeTime != null && leg.detFreeTime > 0
    if (!hasDemFreeTime && !hasDetFreeTime) continue

    // Find the next leg in sequence (the pickup/onward leg)
    const nextLeg = legs.find((l) => l.legSequence === leg.legSequence + 1)

    // Find units assigned to this leg
    const assignedUnitIds = unitLegs
      .filter((ul) => ul.legId === leg.id)
      .map((ul) => ul.unitId)
    const uniqueUnitIds = [...new Set(assignedUnitIds)]

    // Compute per-unit if there are unit assignments, otherwise compute at leg level
    const unitEntries = uniqueUnitIds.length > 0
      ? uniqueUnitIds.map((uid) => ({ unitId: uid, unit: unitById.get(uid) }))
      : [{ unitId: null as string | null, unit: undefined as UnitInput | undefined }]

    for (const { unitId, unit } of unitEntries) {
      const { pickup, delivery, dropoff } = unitId
        ? resolveUnitDates(unitId, nextLeg, unitLegs)
        : { pickup: null as Date | null, delivery: null as Date | null, dropoff: null as Date | null }

      // Demurrage: starts at ATA, ends when this unit's container is picked up
      if (hasDemFreeTime) {
        const endDate = pickup ?? now
        const elapsed = daysBetween(ata, endDate)
        const overdue = Math.max(0, elapsed - leg.demFreeTime!)

        exposures.push({
          legId: leg.id,
          legSequence: leg.legSequence,
          unitId,
          containerNumber: unit?.containerNumber ?? null,
          type: 'demurrage',
          freeTimeDays: leg.demFreeTime!,
          elapsedDays: elapsed,
          overdueDays: overdue,
          startDate: ata,
          endDate: pickup ? pickup.toISOString() : null,
          status: resolveDemDetStatus(elapsed, leg.demFreeTime!),
        })
      }

      // Detention: starts when this unit's container leaves port, ends when empty container is returned to depot
      if (hasDetFreeTime && pickup) {
        const returnDate = dropoff ?? now
        const pickupIso = pickup.toISOString()
        const elapsed = daysBetween(pickupIso, returnDate)
        const overdue = Math.max(0, elapsed - leg.detFreeTime!)

        exposures.push({
          legId: leg.id,
          legSequence: leg.legSequence,
          unitId,
          containerNumber: unit?.containerNumber ?? null,
          type: 'detention',
          freeTimeDays: leg.detFreeTime!,
          elapsedDays: elapsed,
          overdueDays: overdue,
          startDate: pickupIso,
          endDate: dropoff ? dropoff.toISOString() : null,
          status: resolveDemDetStatus(elapsed, leg.detFreeTime!),
        })
      }
    }
  }

  return exposures
}
