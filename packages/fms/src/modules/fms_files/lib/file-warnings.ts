/**
 * FMS File Warnings & Coverage
 *
 * Pure functions that compute validation warnings and leg coverage
 * from a file's units, legs, and unit-leg assignments.
 * Called at query time (not stored). Logic follows FMS-rework.md spec.
 */

import type { LegTimestampEntry } from '../data/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WarningType =
  | 'schedule_conflict'
  | 'uncovered_unit'
  | 'route_gap'
  | 'unassigned_unit'
  | 'cutoff_approaching'
  | 'cutoff_passed'
  | 'dem_det_risk'
  | 'dem_det_plan_exceeded'

export type FileWarning = {
  type: WarningType
  message: string
  affectedItems: string[]
}

type UnitInput = {
  id: string
  cargoType: string
  originLocationId?: string | null
  destinationLocationId?: string | null
  containerNumber?: string | null
  containerType?: string | null
  commodityDescription?: string | null
}

type LegInput = {
  id: string
  legSequence: number
  type?: string
  originLocationId?: string | null
  destinationLocationId?: string | null
  ptaTimestamps?: LegTimestampEntry[] | null
  etaTimestamps?: LegTimestampEntry[] | null
  ataTimestamps?: LegTimestampEntry[] | null
  ptdTimestamps?: LegTimestampEntry[] | null
  etdTimestamps?: LegTimestampEntry[] | null
  atdTimestamps?: LegTimestampEntry[] | null
  gateInCutoff?: Date | string | null
  documentationCutoff?: Date | string | null
  vgmCutoff?: Date | string | null
  dangerousGoodsCutoff?: Date | string | null
  demFreeTime?: number | null
  detFreeTime?: number | null
}

type UnitLegInput = {
  unitId: string
  legId: string
  ptd?: string | null
  etd?: string | null
  atd?: string | null
  pta?: string | null
  eta?: string | null
  ata?: string | null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getPrimaryDate(entries: LegTimestampEntry[] | null | undefined): Date | null {
  if (!entries?.length) return null
  const latest = entries.reduce((best, entry) =>
    entry.updatedAt >= best.updatedAt ? entry : best
  )
  return new Date(latest.value)
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Find the earliest pickup date from the next leg's unit-level assignments.
 * For TRUCK next legs, timestamps live on UnitLeg as plain text.
 * For SHIP/RAIL/AIR next legs, timestamps live on the leg as SCD arrays.
 */
function findNextLegPickupDate(
  nextLeg: LegInput | undefined,
  unitLegs: UnitLegInput[],
): Date | null {
  if (!nextLeg) return null

  if (nextLeg.type === 'TRUCK') {
    const nextUnitLegs = unitLegs.filter((ul) => ul.legId === nextLeg.id)
    const pickupDates = nextUnitLegs
      .map((ul) => ul.atd ? parseDate(ul.atd) : null)
      .filter((d): d is Date => d !== null)
    if (pickupDates.length === 0) return null
    return pickupDates.reduce((earliest, d) => d < earliest ? d : earliest)
  }

  return getPrimaryDate(nextLeg.atdTimestamps)
}

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
    return deliveryDates.reduce((latest, d) => d > latest ? d : latest)
  }

  return getPrimaryDate(nextLeg.ataTimestamps)
}

function unitLabel(unit: UnitInput): string {
  if (unit.cargoType === 'FCL') {
    const num = unit.containerNumber
    const type = unit.containerType ?? '?'
    return num ? `${num} (${type})` : `${type} (TBD)`
  }
  return unit.commodityDescription
    ? `LCL: ${unit.commodityDescription.slice(0, 30)}`
    : 'LCL unit'
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute all warnings for a file.
 * Returns an array of FileWarning objects, empty if no issues.
 */
export function computeFileWarnings(
  units: UnitInput[],
  legs: LegInput[],
  unitLegs: UnitLegInput[],
): FileWarning[] {
  if (legs.length === 0) return []

  const warnings: FileWarning[] = []

  const legById = new Map(legs.map((l) => [l.id, l]))

  // unit → set of leg IDs
  const assignedLegIdsByUnit = new Map<string, Set<string>>()
  for (const ul of unitLegs) {
    if (!assignedLegIdsByUnit.has(ul.unitId)) {
      assignedLegIdsByUnit.set(ul.unitId, new Set())
    }
    assignedLegIdsByUnit.get(ul.unitId)!.add(ul.legId)
  }

  for (const unit of units) {
    const assignedLegIds = assignedLegIdsByUnit.get(unit.id) ?? new Set<string>()
    const label = unitLabel(unit)

    // ── 1. Unassigned unit ───────────────────────────────────────────────────
    if (assignedLegIds.size === 0) {
      warnings.push({
        type: 'unassigned_unit',
        message: `Unit not assigned to any leg`,
        affectedItems: [label],
      })
      continue
    }

    // Resolve assigned legs, sorted by sequence
    const assignedLegs = [...assignedLegIds]
      .map((id) => legById.get(id))
      .filter((l): l is LegInput => !!l)
      .sort((a, b) => a.legSequence - b.legSequence)

    const firstLeg = assignedLegs[0]
    const lastLeg = assignedLegs[assignedLegs.length - 1]

    // ── 2. Uncovered unit (origin/destination mismatch) ──────────────────────
    // Skip mismatch checks when either side is null (location not yet assigned)
    if (firstLeg.originLocationId && unit.originLocationId && firstLeg.originLocationId !== unit.originLocationId) {
      warnings.push({
        type: 'uncovered_unit',
        message: `Unit origin doesn't match first leg origin`,
        affectedItems: [label],
      })
    }

    if (lastLeg.destinationLocationId && unit.destinationLocationId && lastLeg.destinationLocationId !== unit.destinationLocationId) {
      warnings.push({
        type: 'uncovered_unit',
        message: `Unit destination doesn't match last leg destination`,
        affectedItems: [label],
      })
    }

    // ── 3. Route gap (consecutive legs don't connect) ────────────────────────
    const assignedSequences = [...new Set(assignedLegs.map((l) => l.legSequence))].sort(
      (a, b) => a - b
    )

    for (let i = 0; i < assignedSequences.length - 1; i++) {
      const seqN = assignedSequences[i]
      const seqN1 = assignedSequences[i + 1]

      const legsAtSeqN = assignedLegs.filter((l) => l.legSequence === seqN)
      const legsAtSeqN1 = assignedLegs.filter((l) => l.legSequence === seqN1)

      const destsAtN = new Set(legsAtSeqN.map((l) => l.destinationLocationId).filter(Boolean))
      const originsAtN1 = new Set(legsAtSeqN1.map((l) => l.originLocationId).filter(Boolean))

      // If either set is empty (locations not yet assigned), skip the gap check
      const connects = destsAtN.size === 0 || originsAtN1.size === 0
        || [...destsAtN].some((dest) => originsAtN1.has(dest))
      if (!connects) {
        warnings.push({
          type: 'route_gap',
          message: `Route gap between leg ${seqN} and leg ${seqN1}`,
          affectedItems: [label],
        })
      }
    }

    // ── 4. Schedule conflict (leg N arrival after leg N+1 departure) ─────────
    // Build a lookup: legId → unit-leg record for this unit
    const unitLegByLegId = new Map(
      unitLegs.filter((ul) => ul.unitId === unit.id).map((ul) => [ul.legId, ul])
    )

    for (let i = 0; i < assignedSequences.length - 1; i++) {
      const seqN = assignedSequences[i]
      const seqN1 = assignedSequences[i + 1]

      const legsAtSeqN = assignedLegs.filter((l) => l.legSequence === seqN)
      const legsAtSeqN1 = assignedLegs.filter((l) => l.legSequence === seqN1)

      // Per-unit arrival on leg N: ATA > ETA > PTA, then fall back to leg-level SCD
      const arrivalN = legsAtSeqN.reduce<Date | null>((latest, leg) => {
        const ul = unitLegByLegId.get(leg.id)
        const raw = ul?.ata ?? ul?.eta ?? ul?.pta
        const d = raw ? new Date(raw) : (getPrimaryDate(leg.ataTimestamps) ?? getPrimaryDate(leg.etaTimestamps))
        if (!d || isNaN(d.getTime())) return latest
        return latest === null || d > latest ? d : latest
      }, null)

      // Per-unit departure on leg N+1: ATD > ETD > PTD, then fall back to leg-level SCD
      const departureN1 = legsAtSeqN1.reduce<Date | null>((earliest, leg) => {
        const ul = unitLegByLegId.get(leg.id)
        const raw = ul?.atd ?? ul?.etd ?? ul?.ptd
        const d = raw ? new Date(raw) : (getPrimaryDate(leg.ptdTimestamps) ?? getPrimaryDate(leg.etdTimestamps))
        if (!d || isNaN(d.getTime())) return earliest
        return earliest === null || d < earliest ? d : earliest
      }, null)

      if (arrivalN && departureN1 && arrivalN > departureN1) {
        warnings.push({
          type: 'schedule_conflict',
          message: `Schedule conflict: leg ${seqN} arrival is after leg ${seqN1} departure`,
          affectedItems: [label],
        })
      }
    }
  }

  // ── 5. Cutoff warnings ────────────────────────────────────────────────────
  const now = new Date()
  const CUTOFF_APPROACHING_MS = 48 * 60 * 60 * 1000

  for (const leg of legs) {
    const legHasAtd = getPrimaryDate(leg.atdTimestamps) !== null
    if (legHasAtd) continue // already departed, cutoffs are irrelevant

    const legLabel = `leg ${leg.legSequence}${leg.type ? ` (${leg.type})` : ''}`
    const cutoffs: Array<{ name: string; date: Date | string | null | undefined }> = [
      { name: 'Gate-in cutoff', date: leg.gateInCutoff },
      { name: 'Documentation cutoff', date: leg.documentationCutoff },
      { name: 'VGM cutoff', date: leg.vgmCutoff },
      { name: 'Dangerous goods cutoff', date: leg.dangerousGoodsCutoff },
    ]

    for (const cutoff of cutoffs) {
      if (!cutoff.date) continue
      const cutoffDate = cutoff.date instanceof Date ? cutoff.date : new Date(cutoff.date)
      if (isNaN(cutoffDate.getTime())) continue

      const diffMs = cutoffDate.getTime() - now.getTime()

      if (diffMs < 0) {
        warnings.push({
          type: 'cutoff_passed',
          message: `${cutoff.name} passed for ${legLabel}`,
          affectedItems: [legLabel],
        })
      } else if (diffMs < CUTOFF_APPROACHING_MS) {
        const hoursLeft = Math.ceil(diffMs / (60 * 60 * 1000))
        warnings.push({
          type: 'cutoff_approaching',
          message: `${cutoff.name} in ${hoursLeft}h for ${legLabel}`,
          affectedItems: [legLabel],
        })
      }
    }
  }

  // ── 6. Demurrage & detention risk ──────────────────────────────────────────
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const DEM_DET_APPROACHING_DAYS = 2

  for (const leg of legs) {
    if (leg.type !== 'SHIP' && leg.type !== 'RAIL') continue

    const ata = getPrimaryDate(leg.ataTimestamps)
    if (!ata) continue

    const legLabel = `leg ${leg.legSequence} (${leg.type})`

    // Find next leg's pickup date (when container leaves port)
    const nextLeg = legs.find((l) => l.legSequence === leg.legSequence + 1)
    const pickupDate = findNextLegPickupDate(nextLeg, unitLegs)
    const deliveryDate = findNextLegDeliveryDate(nextLeg, unitLegs)

    // Demurrage: ATA → pickup (or now if not yet picked up)
    if (leg.demFreeTime != null && leg.demFreeTime > 0) {
      const demEnd = pickupDate ?? now
      const elapsedDays = Math.floor((demEnd.getTime() - ata.getTime()) / MS_PER_DAY)
      const overdueDays = elapsedDays - leg.demFreeTime

      if (overdueDays > 0) {
        warnings.push({
          type: 'dem_det_risk',
          message: `Demurrage free time exceeded by ${overdueDays} day${overdueDays !== 1 ? 's' : ''} on ${legLabel}`,
          affectedItems: [legLabel],
        })
      } else if (!pickupDate && elapsedDays >= leg.demFreeTime - DEM_DET_APPROACHING_DAYS) {
        const daysLeft = leg.demFreeTime - elapsedDays
        warnings.push({
          type: 'dem_det_risk',
          message: `Demurrage free time expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} on ${legLabel}`,
          affectedItems: [legLabel],
        })
      }
    }

    // Detention: pickup → delivery (or now if still out)
    if (leg.detFreeTime != null && leg.detFreeTime > 0 && pickupDate) {
      const detEnd = deliveryDate ?? now
      const elapsedDays = Math.floor((detEnd.getTime() - pickupDate.getTime()) / MS_PER_DAY)
      const overdueDays = elapsedDays - leg.detFreeTime

      if (overdueDays > 0) {
        warnings.push({
          type: 'dem_det_risk',
          message: `Detention free time exceeded by ${overdueDays} day${overdueDays !== 1 ? 's' : ''} on ${legLabel}`,
          affectedItems: [legLabel],
        })
      } else if (!deliveryDate && elapsedDays >= leg.detFreeTime - DEM_DET_APPROACHING_DAYS) {
        const daysLeft = leg.detFreeTime - elapsedDays
        warnings.push({
          type: 'dem_det_risk',
          message: `Detention free time expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} on ${legLabel}`,
          affectedItems: [legLabel],
        })
      }
    }
  }

  // ── 7. Planned schedule exceeds DEM/DET free time ───────────────────────
  // For SHIP/RAIL legs with free time set, check if the planned dwell
  // (gap between this leg's arrival and the next leg's departure) exceeds
  // free time — even before actual arrival happens.
  const legsBySequence = new Map<number, LegInput[]>()
  for (const leg of legs) {
    if (!legsBySequence.has(leg.legSequence)) legsBySequence.set(leg.legSequence, [])
    legsBySequence.get(leg.legSequence)!.push(leg)
  }
  const sortedSequences = [...legsBySequence.keys()].sort((a, b) => a - b)

  for (let i = 0; i < sortedSequences.length; i++) {
    const seq = sortedSequences[i]
    const nextSeq = sortedSequences[i + 1]
    if (nextSeq === undefined) continue

    const currentLegs = legsBySequence.get(seq)!
    const nextLegs = legsBySequence.get(nextSeq)!

    for (const leg of currentLegs) {
      if (leg.type !== 'SHIP' && leg.type !== 'RAIL') continue
      if (!leg.demFreeTime && !leg.detFreeTime) continue

      // Already has ATA — section 6 handles actual D&D risk
      const ata = getPrimaryDate(leg.ataTimestamps)
      if (ata) continue

      // Resolve arrival with hierarchy: ATA > ETA > PTA
      // (ATA already handled above — section 6 covers actual D&D risk)
      const arrivalDate = getPrimaryDate(leg.etaTimestamps) ?? getPrimaryDate(leg.ptaTimestamps)
      const arrivalLevel: 'estimated' | 'planned' | null = getPrimaryDate(leg.etaTimestamps) ? 'estimated' : getPrimaryDate(leg.ptaTimestamps) ? 'planned' : null

      if (!arrivalDate) {
        // No arrival estimate yet — if departure is set, flag that ETA is needed
        const hasDeparture = getPrimaryDate(leg.etdTimestamps) ?? getPrimaryDate(leg.ptdTimestamps)
        if (hasDeparture && (leg.demFreeTime || leg.detFreeTime)) {
          const legLabel = `leg ${leg.legSequence} (${leg.type})`
          warnings.push({
            type: 'dem_det_plan_exceeded',
            message: `${legLabel} has DEM/DET free time but no arrival estimate — add ETA to validate schedule`,
            affectedItems: [legLabel],
          })
        }
        continue
      }

      // Resolve next leg departure per container (TRUCK timestamps are per unit-leg)
      const nextLegIds = new Set(nextLegs.map((l) => l.id))
      const legLabel = `leg ${leg.legSequence} (${leg.type})`

      // Leg-level departure (SHIP/RAIL/AIR) — shared across all containers
      const nextLegLevelDeparture = nextLegs
        .map((nLeg) => getPrimaryDate(nLeg.atdTimestamps) ?? getPrimaryDate(nLeg.etdTimestamps) ?? getPrimaryDate(nLeg.ptdTimestamps))
        .filter((d): d is Date => d !== null)
        .reduce<Date | null>((earliest, d) => earliest === null || d < earliest ? d : earliest, null)

      // Unit-leg level — check each container independently
      const nextUnitLegsForLeg = unitLegs.filter((ul) => nextLegIds.has(ul.legId))
      const unitById = new Map(units.map((u) => [u.id, u]))

      // Track whether any container has a departure set
      let anyContainerHasDeparture = nextLegLevelDeparture !== null

      // Check per-container departures
      const checkedUnitIds = new Set<string>()
      for (const nul of nextUnitLegsForLeg) {
        if (checkedUnitIds.has(nul.unitId)) continue
        checkedUnitIds.add(nul.unitId)

        // Resolve departure with hierarchy: ATD > ETD > PTD
        const depRaw = nul.atd ?? nul.etd ?? nul.ptd
        const depDate = depRaw ? new Date(depRaw) : null
        const containerDeparture = (depDate && !isNaN(depDate.getTime())) ? depDate : nextLegLevelDeparture
        if (!containerDeparture) continue

        anyContainerHasDeparture = true

        // Determine confidence level
        const depLevel = nul.atd ? 'actual' : nul.etd ? 'estimated' : nul.ptd ? 'planned' : null
        const confidence = (arrivalLevel === 'planned' || depLevel === 'planned') ? 'Planned' : 'Estimated'

        const dwellDays = Math.ceil((containerDeparture.getTime() - arrivalDate.getTime()) / MS_PER_DAY)
        const unit = unitById.get(nul.unitId)
        const containerLabel = unit?.containerNumber ?? unit?.commodityDescription?.slice(0, 20) ?? nul.unitId.slice(0, 8)

        if (leg.demFreeTime && dwellDays > leg.demFreeTime) {
          const overby = dwellDays - leg.demFreeTime
          warnings.push({
            type: 'dem_det_plan_exceeded',
            message: `${confidence} schedule exceeds demurrage free time by ${overby} day${overby !== 1 ? 's' : ''} for ${containerLabel} on ${legLabel} (${dwellDays}d dwell vs ${leg.demFreeTime}d free)`,
            affectedItems: [containerLabel, legLabel],
          })
        }

        if (leg.detFreeTime && dwellDays > leg.detFreeTime) {
          const overby = dwellDays - leg.detFreeTime
          warnings.push({
            type: 'dem_det_plan_exceeded',
            message: `${confidence} schedule exceeds detention free time by ${overby} day${overby !== 1 ? 's' : ''} for ${containerLabel} on ${legLabel} (${dwellDays}d dwell vs ${leg.detFreeTime}d free)`,
            affectedItems: [containerLabel, legLabel],
          })
        }
      }

      // If no per-container check was done (no unit-legs on next leg), fall back to leg-level
      if (checkedUnitIds.size === 0 && nextLegLevelDeparture) {
        const confidence = arrivalLevel === 'planned' ? 'Planned' : 'Estimated'
        const dwellDays = Math.ceil((nextLegLevelDeparture.getTime() - arrivalDate.getTime()) / MS_PER_DAY)

        if (leg.demFreeTime && dwellDays > leg.demFreeTime) {
          const overby = dwellDays - leg.demFreeTime
          warnings.push({
            type: 'dem_det_plan_exceeded',
            message: `${confidence} schedule exceeds demurrage free time by ${overby} day${overby !== 1 ? 's' : ''} on ${legLabel} (${dwellDays}d dwell vs ${leg.demFreeTime}d free)`,
            affectedItems: [legLabel],
          })
        }
        if (leg.detFreeTime && dwellDays > leg.detFreeTime) {
          const overby = dwellDays - leg.detFreeTime
          warnings.push({
            type: 'dem_det_plan_exceeded',
            message: `${confidence} schedule exceeds detention free time by ${overby} day${overby !== 1 ? 's' : ''} on ${legLabel} (${dwellDays}d dwell vs ${leg.detFreeTime}d free)`,
            affectedItems: [legLabel],
          })
        }
      }

      if (!anyContainerHasDeparture && nextLegs.length > 0) {
        const nextLegLabel = `leg ${nextSeq}${nextLegs[0].type ? ` (${nextLegs[0].type})` : ''}`
        if (leg.demFreeTime || leg.detFreeTime) {
          warnings.push({
            type: 'dem_det_plan_exceeded',
            message: `${nextLegLabel} has no scheduled departure — cannot verify DEM/DET free time on ${legLabel}`,
            affectedItems: [legLabel, nextLegLabel],
          })
        }
      }
    }
  }

  return warnings
}

/**
 * Compute leg coverage string for a single unit.
 *
 * Algorithm: greedy chain through the unit's ASSIGNED legs only (sorted by sequence).
 * - If the chain reaches the unit's destination → "N/N" (fully covered, N = chain length)
 * - If the chain is incomplete → "N/T" where T = total sequences in the file
 *
 * This means:
 *   - One direct leg covering full route → "1/1"
 *   - Two legs covering full route → "2/2"
 *   - Partial coverage (unit only assigned to first leg of a three-leg file) → "1/3"
 *   - Unassigned unit → "0/T"
 */
export function computeLegCoverage(
  unitId: string,
  unitOrigin: string | null | undefined,
  unitDest: string | null | undefined,
  unitLegs: UnitLegInput[],
  legs: LegInput[],
): string {
  const totalSequences = new Set(legs.map((l) => l.legSequence)).size
  if (totalSequences === 0) return '0/0'

  // Cannot compute coverage without both origin and destination
  if (!unitOrigin || !unitDest) return `0/${totalSequences}`

  const legById = new Map(legs.map((l) => [l.id, l]))

  // Resolve assigned legs for this unit
  const assignedLegs = unitLegs
    .filter((ul) => ul.unitId === unitId)
    .map((ul) => legById.get(ul.legId))
    .filter((l): l is LegInput => !!l)
    .sort((a, b) => a.legSequence - b.legSequence)

  if (assignedLegs.length === 0) {
    return `0/${totalSequences}`
  }

  // Group assigned legs by sequence
  const assignedBySeq = new Map<number, LegInput[]>()
  for (const leg of assignedLegs) {
    if (!assignedBySeq.has(leg.legSequence)) assignedBySeq.set(leg.legSequence, [])
    assignedBySeq.get(leg.legSequence)!.push(leg)
  }
  const sortedAssignedSeqs = [...assignedBySeq.keys()].sort((a, b) => a - b)

  // Greedy walk through the assigned legs only
  let current: string | null | undefined = unitOrigin
  let coveredSeqs = 0

  for (const seq of sortedAssignedSeqs) {
    if (current === unitDest) break
    const connecting = assignedBySeq.get(seq)!.find((l) => l.originLocationId === current)
    if (connecting) {
      coveredSeqs++
      current = connecting.destinationLocationId
    }
  }

  if (current === unitDest) {
    // Complete chain found — show "N/N"
    return `${coveredSeqs}/${coveredSeqs}`
  }

  // Incomplete chain — show how far we got vs total file sequences
  return `${coveredSeqs}/${totalSequences}`
}
