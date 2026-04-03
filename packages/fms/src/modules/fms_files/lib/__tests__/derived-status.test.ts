import { describe, it, expect } from 'vitest'
import {
  computeTransportStatus,
  computeFinancialStatus,
  computeDocumentationStatus,
  computeFileStatus,
} from '../derived-status'

// ─── Factories ──────────────────────────────────────────────────────────────

function makeUnit(id: string, origin?: string, dest?: string) {
  return { id, originLocationId: origin ?? null, destinationLocationId: dest ?? null }
}

function makeLeg(
  id: string,
  seq: number,
  opts: {
    origin?: string
    dest?: string
    atd?: boolean
    ata?: boolean
  } = {}
) {
  return {
    id,
    legSequence: seq,
    originLocationId: opts.origin ?? null,
    destinationLocationId: opts.dest ?? null,
    atdTimestamps: opts.atd
      ? [{ value: '2026-01-01T00:00:00Z', offset: null, source: 'manual' as const, updatedAt: '2026-01-01T00:00:00Z' }]
      : null,
    ataTimestamps: opts.ata
      ? [{ value: '2026-01-05T00:00:00Z', offset: null, source: 'manual' as const, updatedAt: '2026-01-05T00:00:00Z' }]
      : null,
  }
}

function makeUnitLeg(unitId: string, legId: string, opts: { atd?: string; ata?: string } = {}) {
  return { unitId, legId, atd: opts.atd ?? null, ata: opts.ata ?? null }
}

// ─── Transport Status ───────────────────────────────────────────────────────

describe('computeTransportStatus', () => {
  it('returns EMPTY when no units', () => {
    expect(computeTransportStatus([], [makeLeg('l1', 1)], [])).toBe('EMPTY')
  })

  it('returns EMPTY when no legs', () => {
    expect(computeTransportStatus([makeUnit('u1')], [], [])).toBe('EMPTY')
  })

  it('returns PLANNING when units are not fully covered', () => {
    const units = [makeUnit('u1', 'A', 'C')]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B' })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('PLANNING')
  })

  it('returns READY when all units have complete coverage but no departures', () => {
    const units = [makeUnit('u1', 'A', 'B')]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B' })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('READY')
  })

  it('returns IN_TRANSIT when a leg has ATD but final leg has no ATA', () => {
    const units = [makeUnit('u1', 'A', 'C')]
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B', atd: true }),
      makeLeg('l2', 2, { origin: 'B', dest: 'C' }),
    ]
    const unitLegs = [makeUnitLeg('u1', 'l1'), makeUnitLeg('u1', 'l2')]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('IN_TRANSIT')
  })

  it('returns IN_TRANSIT when unit-leg level ATD is set', () => {
    const units = [makeUnit('u1', 'A', 'B')]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B' })]
    const unitLegs = [makeUnitLeg('u1', 'l1', { atd: '2026-01-01T00:00:00Z' })]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('IN_TRANSIT')
  })

  it('returns DELIVERED when all final legs have ATA', () => {
    const units = [makeUnit('u1', 'A', 'B')]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B', atd: true, ata: true })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('DELIVERED')
  })

  it('returns DELIVERED when all unit-legs on final leg have ATA', () => {
    const units = [makeUnit('u1', 'A', 'B')]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B', atd: true })]
    const unitLegs = [makeUnitLeg('u1', 'l1', { atd: '2026-01-01T00:00:00Z', ata: '2026-01-05T00:00:00Z' })]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('DELIVERED')
  })

  it('returns PARTIALLY_DELIVERED when some final legs have ATA', () => {
    const units = [makeUnit('u1', 'A', 'C'), makeUnit('u2', 'A', 'C')]
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B', atd: true }),
      makeLeg('l2a', 2, { origin: 'B', dest: 'C', ata: true }),
      makeLeg('l2b', 2, { origin: 'B', dest: 'C' }),
    ]
    const unitLegs = [
      makeUnitLeg('u1', 'l1'),
      makeUnitLeg('u1', 'l2a'),
      makeUnitLeg('u2', 'l1'),
      makeUnitLeg('u2', 'l2b'),
    ]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('PARTIALLY_DELIVERED')
  })

  it('returns PLANNING when unit has no origin/destination', () => {
    const units = [makeUnit('u1')]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B' })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('PLANNING')
  })

  it('handles multi-leg route with full coverage', () => {
    const units = [makeUnit('u1', 'A', 'C')]
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B' }),
      makeLeg('l2', 2, { origin: 'B', dest: 'C' }),
    ]
    const unitLegs = [makeUnitLeg('u1', 'l1'), makeUnitLeg('u1', 'l2')]
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('READY')
  })
})

// ─── Financial Status ───────────────────────────────────────────────────────

describe('computeFinancialStatus', () => {
  it('returns NO_LINES when no cost lines', () => {
    expect(computeFinancialStatus([], [])).toBe('NO_LINES')
  })

  it('returns ESTIMATED when lines have no actual cost', () => {
    const lines = [{ estimatedCost: '100.00', actualCost: null, soldAmount: null }]
    expect(computeFinancialStatus(lines, [])).toBe('ESTIMATED')
  })

  it('returns PARTIALLY_INVOICED when some lines have actual cost', () => {
    const lines = [
      { estimatedCost: '100.00', actualCost: '95.00', soldAmount: null },
      { estimatedCost: '200.00', actualCost: null, soldAmount: null },
    ]
    expect(computeFinancialStatus(lines, [])).toBe('PARTIALLY_INVOICED')
  })

  it('returns INVOICED when all lines have actual cost but invoices not reviewed', () => {
    const lines = [
      { estimatedCost: '100.00', actualCost: '95.00', soldAmount: null },
      { estimatedCost: '200.00', actualCost: '190.00', soldAmount: null },
    ]
    expect(computeFinancialStatus(lines, [])).toBe('INVOICED')
  })

  it('returns INVOICED when all lines have actual cost but invoices still pending', () => {
    const lines = [{ estimatedCost: '100.00', actualCost: '95.00', soldAmount: null }]
    const invoices = [{ status: 'pending_review' }]
    expect(computeFinancialStatus(lines, invoices)).toBe('INVOICED')
  })

  it('returns SETTLED when all lines have actual cost and all invoices reviewed', () => {
    const lines = [{ estimatedCost: '100.00', actualCost: '95.00', soldAmount: null }]
    const invoices = [{ status: 'approved' }]
    expect(computeFinancialStatus(lines, invoices)).toBe('SETTLED')
  })

  it('treats actualCost of "0" as not having actual cost', () => {
    const lines = [{ estimatedCost: '100.00', actualCost: '0', soldAmount: null }]
    expect(computeFinancialStatus(lines, [])).toBe('ESTIMATED')
  })
})

// ─── Documentation Status ───────────────────────────────────────────────────

describe('computeDocumentationStatus', () => {
  it('returns PENDING when no documents and no invoices', () => {
    expect(computeDocumentationStatus(0, [])).toBe('PENDING')
  })

  it('returns REVIEW_NEEDED when invoices have pending review', () => {
    expect(computeDocumentationStatus(1, [{ status: 'pending_review' }])).toBe('REVIEW_NEEDED')
  })

  it('returns COMPLETE when documents exist and all invoices reviewed', () => {
    expect(computeDocumentationStatus(2, [{ status: 'approved' }])).toBe('COMPLETE')
  })

  it('returns PARTIAL when documents exist but no invoices', () => {
    expect(computeDocumentationStatus(3, [])).toBe('PARTIAL')
  })

  it('returns PARTIAL when no documents but invoices are all reviewed', () => {
    expect(computeDocumentationStatus(0, [{ status: 'approved' }])).toBe('PARTIAL')
  })

  it('returns REVIEW_NEEDED even when some invoices are approved', () => {
    const invoices = [{ status: 'approved' }, { status: 'pending_review' }]
    expect(computeDocumentationStatus(1, invoices)).toBe('REVIEW_NEEDED')
  })
})

// ─── Combined File Status ───────────────────────────────────────────────────

describe('computeFileStatus', () => {
  it('combines all three status dimensions', () => {
    const result = computeFileStatus([], [], [], [], [], 0)
    expect(result).toEqual({
      transport: 'EMPTY',
      financial: 'NO_LINES',
      documentation: 'PENDING',
    })
  })

  it('returns independent statuses for each dimension', () => {
    const units = [makeUnit('u1', 'A', 'B')]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B', atd: true, ata: true })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]
    const lines = [{ estimatedCost: '100.00', actualCost: '95.00', soldAmount: null }]
    const invoices = [{ status: 'pending_review' }]

    const result = computeFileStatus(units, legs, unitLegs, lines, invoices, 3)
    expect(result).toEqual({
      transport: 'DELIVERED',
      financial: 'INVOICED',
      documentation: 'REVIEW_NEEDED',
    })
  })
})
