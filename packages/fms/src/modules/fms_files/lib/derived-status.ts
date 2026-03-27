/**
 * FMS File Derived Status
 *
 * Pure functions that compute three independent status dimensions for a file:
 * - Transport: physical movement of cargo through the transport chain
 * - Financial: cost line completion and invoice reconciliation
 * - Documentation: document linking and invoice review state
 *
 * All functions are side-effect-free and called at query time (not stored).
 */

import type {
  TransportStatus,
  FinancialStatus,
  DocumentationStatus,
  FileStatus,
  LegTimestampEntry,
} from '../data/types'

// ─── Input types ─────────────────────────────────────────────────────────────

type UnitInput = {
  id: string
  originLocationId?: string | null
  destinationLocationId?: string | null
}

type LegInput = {
  id: string
  legSequence: number
  originLocationId?: string | null
  destinationLocationId?: string | null
  atdTimestamps?: LegTimestampEntry[] | null
  ataTimestamps?: LegTimestampEntry[] | null
}

type UnitLegInput = {
  unitId: string
  legId: string
  atd?: string | null
  ata?: string | null
}

type LineInput = {
  estimatedCost?: string | null
  actualCost?: string | null
  soldAmount?: string | null
}

type InvoiceInput = {
  status: string // 'pending_review' | 'approved' | 'rejected'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasTimestamp(entries: LegTimestampEntry[] | null | undefined): boolean {
  return !!entries?.length
}

function isUnitFullyCovered(
  unitId: string,
  unitOrigin: string | null | undefined,
  unitDest: string | null | undefined,
  unitLegs: UnitLegInput[],
  legs: LegInput[],
): boolean {
  if (!unitOrigin || !unitDest) return false

  const legById = new Map(legs.map((l) => [l.id, l]))
  const assignedLegs = unitLegs
    .filter((ul) => ul.unitId === unitId)
    .map((ul) => legById.get(ul.legId))
    .filter((l): l is LegInput => !!l)
    .sort((a, b) => a.legSequence - b.legSequence)

  if (assignedLegs.length === 0) return false

  // Greedy chain walk
  const bySeq = new Map<number, LegInput[]>()
  for (const leg of assignedLegs) {
    if (!bySeq.has(leg.legSequence)) bySeq.set(leg.legSequence, [])
    bySeq.get(leg.legSequence)!.push(leg)
  }

  let current: string | null | undefined = unitOrigin
  for (const seq of [...bySeq.keys()].sort((a, b) => a - b)) {
    if (current === unitDest) break
    const connecting = bySeq.get(seq)!.find((l) => l.originLocationId === current)
    if (connecting) {
      current = connecting.destinationLocationId
    }
  }

  return current === unitDest
}

// ─── Transport Status ────────────────────────────────────────────────────────

export function computeTransportStatus(
  units: UnitInput[],
  legs: LegInput[],
  unitLegs: UnitLegInput[],
): TransportStatus {
  if (units.length === 0 || legs.length === 0) return 'EMPTY'

  // Check if all units have complete coverage
  const allCovered = units.every((u) =>
    isUnitFullyCovered(u.id, u.originLocationId, u.destinationLocationId, unitLegs, legs)
  )

  if (!allCovered) return 'PLANNING'

  // Find final legs (highest sequence) per unit
  const legById = new Map(legs.map((l) => [l.id, l]))
  const maxSequence = Math.max(...legs.map((l) => l.legSequence))
  const finalLegIds = new Set(
    legs.filter((l) => l.legSequence === maxSequence).map((l) => l.id)
  )

  // Check ATA on final legs (leg-level for SHIP/RAIL/AIR, unit-leg level for TRUCK)
  const finalLegsWithAta: boolean[] = []
  let anyLegHasAtd = false

  for (const leg of legs) {
    if (hasTimestamp(leg.atdTimestamps)) anyLegHasAtd = true

    // Also check unit-leg level ATD
    const legUnitLegs = unitLegs.filter((ul) => ul.legId === leg.id)
    if (legUnitLegs.some((ul) => ul.atd)) anyLegHasAtd = true

    if (finalLegIds.has(leg.id)) {
      const legHasAta = hasTimestamp(leg.ataTimestamps)
      const allUnitsArrivedOnLeg = legUnitLegs.length > 0 && legUnitLegs.every((ul) => ul.ata)
      finalLegsWithAta.push(legHasAta || allUnitsArrivedOnLeg)
    }
  }

  if (finalLegsWithAta.length > 0 && finalLegsWithAta.every(Boolean)) return 'DELIVERED'
  if (finalLegsWithAta.some(Boolean)) return 'PARTIALLY_DELIVERED'
  if (anyLegHasAtd) return 'IN_TRANSIT'

  return 'READY'
}

// ─── Financial Status ────────────────────────────────────────────────────────

export function computeFinancialStatus(
  lines: LineInput[],
  invoices: InvoiceInput[],
): FinancialStatus {
  if (lines.length === 0) return 'NO_LINES'

  const allHaveActualCost = lines.every((l) => l.actualCost && parseFloat(l.actualCost) !== 0)
  const someHaveActualCost = lines.some((l) => l.actualCost && parseFloat(l.actualCost) !== 0)
  const allInvoicesReviewed = invoices.length > 0 && invoices.every((inv) => inv.status !== 'pending_review')

  if (allHaveActualCost && allInvoicesReviewed) return 'SETTLED'
  if (allHaveActualCost) return 'INVOICED'
  if (someHaveActualCost) return 'PARTIALLY_INVOICED'

  return 'ESTIMATED'
}

// ─── Documentation Status ────────────────────────────────────────────────────

export function computeDocumentationStatus(
  documentCount: number,
  invoices: InvoiceInput[],
): DocumentationStatus {
  if (documentCount === 0 && invoices.length === 0) return 'PENDING'

  const pendingReviewCount = invoices.filter((inv) => inv.status === 'pending_review').length
  if (pendingReviewCount > 0) return 'REVIEW_NEEDED'

  const allInvoicesReviewed = invoices.length > 0 && invoices.every((inv) => inv.status !== 'pending_review')
  if (documentCount > 0 && allInvoicesReviewed) return 'COMPLETE'

  return 'PARTIAL'
}

// ─── Combined status ─────────────────────────────────────────────────────────

export function computeFileStatus(
  units: UnitInput[],
  legs: LegInput[],
  unitLegs: UnitLegInput[],
  lines: LineInput[],
  invoices: InvoiceInput[],
  documentCount: number,
): FileStatus {
  return {
    transport: computeTransportStatus(units, legs, unitLegs),
    financial: computeFinancialStatus(lines, invoices),
    documentation: computeDocumentationStatus(documentCount, invoices),
  }
}
