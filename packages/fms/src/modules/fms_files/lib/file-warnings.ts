/**
 * FMS File Warnings & Coverage
 *
 * Pure functions that compute validation warnings and leg coverage
 * from a file's units, legs, and unit-leg assignments.
 * Called at query time (not stored). Logic follows FMS-rework.md spec.
 */

import type { LegTimestampEntry } from '../data/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WarningType = 'schedule_conflict' | 'uncovered_unit' | 'route_gap' | 'unassigned_unit'

export type FileWarning = {
  type: WarningType
  message: string
  affectedItems: string[]
}

type UnitInput = {
  id: string
  cargoType: string
  originLocationId: string
  destinationLocationId: string
  containerNumber?: string | null
  containerType?: string | null
  commodityDescription?: string | null
}

type LegInput = {
  id: string
  legSequence: number
  originLocationId: string
  destinationLocationId: string
  etaTimestamps?: LegTimestampEntry[] | null
  ataTimestamps?: LegTimestampEntry[] | null
  ptdTimestamps?: LegTimestampEntry[] | null
  etdTimestamps?: LegTimestampEntry[] | null
}

type UnitLegInput = {
  unitId: string
  legId: string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getPrimaryDate(entries: LegTimestampEntry[] | null | undefined): Date | null {
  if (!entries?.length) return null
  const latest = entries.reduce((best, entry) =>
    entry.updatedAt >= best.updatedAt ? entry : best
  )
  return new Date(latest.value)
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
    if (firstLeg.originLocationId !== unit.originLocationId) {
      warnings.push({
        type: 'uncovered_unit',
        message: `Unit origin doesn't match first leg origin`,
        affectedItems: [label],
      })
    }

    if (lastLeg.destinationLocationId !== unit.destinationLocationId) {
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

      const destsAtN = new Set(legsAtSeqN.map((l) => l.destinationLocationId))
      const originsAtN1 = new Set(legsAtSeqN1.map((l) => l.originLocationId))

      const connects = [...destsAtN].some((dest) => originsAtN1.has(dest))
      if (!connects) {
        warnings.push({
          type: 'route_gap',
          message: `Route gap between leg ${seqN} and leg ${seqN1}`,
          affectedItems: [label],
        })
      }
    }

    // ── 4. Schedule conflict (leg N arrival after leg N+1 departure) ─────────
    for (let i = 0; i < assignedSequences.length - 1; i++) {
      const seqN = assignedSequences[i]
      const seqN1 = assignedSequences[i + 1]

      const legsAtSeqN = assignedLegs.filter((l) => l.legSequence === seqN)
      const legsAtSeqN1 = assignedLegs.filter((l) => l.legSequence === seqN1)

      // Use ATA if available, otherwise ETA for arrival of leg N
      const arrivalN = legsAtSeqN.reduce<Date | null>((latest, leg) => {
        const d = getPrimaryDate(leg.ataTimestamps) ?? getPrimaryDate(leg.etaTimestamps)
        if (!d) return latest
        return latest === null || d > latest ? d : latest
      }, null)

      // Use PTD if available, otherwise ETD for departure of leg N+1
      const departureN1 = legsAtSeqN1.reduce<Date | null>((earliest, leg) => {
        const d = getPrimaryDate(leg.ptdTimestamps) ?? getPrimaryDate(leg.etdTimestamps)
        if (!d) return earliest
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
  unitOrigin: string,
  unitDest: string,
  unitLegs: UnitLegInput[],
  legs: LegInput[],
): string {
  const totalSequences = new Set(legs.map((l) => l.legSequence)).size
  if (totalSequences === 0) return '0/0'

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
  let current = unitOrigin
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
