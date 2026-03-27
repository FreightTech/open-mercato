/**
 * FMS File Demurrage & Detention Calculator
 *
 * Pure functions that compute D&D exposure from leg timestamps and free time.
 *
 * - Demurrage: charged when container stays at port after vessel arrival (ATA)
 *   beyond the agreed free time. Starts at ATA, ends when container is picked up.
 * - Detention: charged when container is kept outside the port beyond free time.
 *   Starts when container leaves port, ends when returned empty.
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

function daysSince(isoDate: string, now: Date): number {
  const start = new Date(isoDate)
  if (isNaN(start.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY))
}

function resolveDemDetStatus(elapsedDays: number, freeTimeDays: number): DemDetStatus {
  if (elapsedDays > freeTimeDays) return 'overdue'
  if (elapsedDays >= freeTimeDays - APPROACHING_THRESHOLD_DAYS) return 'approaching'
  return 'within_free_time'
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function computeDemDetExposure(
  legs: LegInput[],
  now: Date = new Date(),
): DemDetExposure[] {
  const exposures: DemDetExposure[] = []

  for (const leg of legs) {
    // D&D only applies to SHIP and RAIL legs
    if (leg.type !== 'SHIP' && leg.type !== 'RAIL') continue

    const ata = getLatestTimestamp(leg.ataTimestamps)
    if (!ata) continue

    // Demurrage: starts at ATA, free time = demFreeTime days
    if (leg.demFreeTime != null && leg.demFreeTime > 0) {
      const elapsed = daysSince(ata, now)
      const overdue = Math.max(0, elapsed - leg.demFreeTime)

      exposures.push({
        legId: leg.id,
        legSequence: leg.legSequence,
        type: 'demurrage',
        freeTimeDays: leg.demFreeTime,
        elapsedDays: elapsed,
        overdueDays: overdue,
        startDate: ata,
        status: resolveDemDetStatus(elapsed, leg.demFreeTime),
      })
    }

    // Detention: starts at ATD (container leaves port), free time = detFreeTime days
    const atd = getLatestTimestamp(leg.atdTimestamps)
    if (leg.detFreeTime != null && leg.detFreeTime > 0 && atd) {
      const elapsed = daysSince(atd, now)
      const overdue = Math.max(0, elapsed - leg.detFreeTime)

      exposures.push({
        legId: leg.id,
        legSequence: leg.legSequence,
        type: 'detention',
        freeTimeDays: leg.detFreeTime,
        elapsedDays: elapsed,
        overdueDays: overdue,
        startDate: atd,
        status: resolveDemDetStatus(elapsed, leg.detFreeTime),
      })
    }
  }

  return exposures
}
