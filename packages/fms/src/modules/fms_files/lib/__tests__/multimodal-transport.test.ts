/**
 * Multimodal Transport Tests
 *
 * Tests a full TRUCK → SHIP → RAIL → TRUCK chain across all pure business
 * logic: status derivation, warnings, D&D exposure, leg coverage.
 *
 * Scenario: FCL export from Warsaw factory → Gdynia port (TRUCK seq=1)
 * → Shanghai (SHIP seq=2) → Chengdu (RAIL seq=3) → final warehouse (TRUCK seq=4)
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeTransportStatus } from '../derived-status'
import { computeFileWarnings, computeLegCoverage } from '../file-warnings'
import { computeDemDetExposure } from '../dem-det'
import { deriveUnitLegStatus } from '../../data/types'
import type { LegTimestampEntry, UnitLegTimestamps } from '../../data/types'

// ─── Shared Factories ───────────────────────────────────────────────────────

const LOC = {
  WARSAW: 'loc-warsaw',
  GDYNIA: 'loc-gdynia',
  SHANGHAI: 'loc-shanghai',
  CHENGDU: 'loc-chengdu',
  WAREHOUSE: 'loc-warehouse',
}

function ts(value: string, source: LegTimestampEntry['source'] = 'manual'): LegTimestampEntry[] {
  return [{ value, offset: null, source, updatedAt: value }]
}

function makeMultimodalLegs(opts: {
  truck1?: { atd?: string; ata?: string }
  ship?: { atd?: string; ata?: string; eta?: string; demFreeTime?: number; detFreeTime?: number; gateInCutoff?: string }
  rail?: { atd?: string; ata?: string; eta?: string; demFreeTime?: number; detFreeTime?: number }
  truck2?: { atd?: string; ata?: string }
} = {}) {
  return [
    {
      id: 'leg-truck1', legSequence: 1, type: 'TRUCK',
      originLocationId: LOC.WARSAW, destinationLocationId: LOC.GDYNIA,
      atdTimestamps: opts.truck1?.atd ? ts(opts.truck1.atd) : null,
      ataTimestamps: opts.truck1?.ata ? ts(opts.truck1.ata) : null,
      etaTimestamps: null, ptaTimestamps: null, etdTimestamps: null, ptdTimestamps: null,
      gateInCutoff: opts.ship?.gateInCutoff ?? null,
      documentationCutoff: null, vgmCutoff: null, dangerousGoodsCutoff: null,
      demFreeTime: null, detFreeTime: null,
    },
    {
      id: 'leg-ship', legSequence: 2, type: 'SHIP',
      originLocationId: LOC.GDYNIA, destinationLocationId: LOC.SHANGHAI,
      atdTimestamps: opts.ship?.atd ? ts(opts.ship.atd) : null,
      ataTimestamps: opts.ship?.ata ? ts(opts.ship.ata) : null,
      etaTimestamps: opts.ship?.eta ? ts(opts.ship.eta) : null,
      ptaTimestamps: null, etdTimestamps: null, ptdTimestamps: null,
      gateInCutoff: opts.ship?.gateInCutoff ?? null,
      documentationCutoff: null, vgmCutoff: null, dangerousGoodsCutoff: null,
      demFreeTime: opts.ship?.demFreeTime ?? null,
      detFreeTime: opts.ship?.detFreeTime ?? null,
    },
    {
      id: 'leg-rail', legSequence: 3, type: 'RAIL',
      originLocationId: LOC.SHANGHAI, destinationLocationId: LOC.CHENGDU,
      atdTimestamps: opts.rail?.atd ? ts(opts.rail.atd) : null,
      ataTimestamps: opts.rail?.ata ? ts(opts.rail.ata) : null,
      etaTimestamps: opts.rail?.eta ? ts(opts.rail.eta) : null,
      ptaTimestamps: null, etdTimestamps: null, ptdTimestamps: null,
      gateInCutoff: null, documentationCutoff: null, vgmCutoff: null, dangerousGoodsCutoff: null,
      demFreeTime: opts.rail?.demFreeTime ?? null,
      detFreeTime: opts.rail?.detFreeTime ?? null,
    },
    {
      id: 'leg-truck2', legSequence: 4, type: 'TRUCK',
      originLocationId: LOC.CHENGDU, destinationLocationId: LOC.WAREHOUSE,
      atdTimestamps: opts.truck2?.atd ? ts(opts.truck2.atd) : null,
      ataTimestamps: opts.truck2?.ata ? ts(opts.truck2.ata) : null,
      etaTimestamps: null, ptaTimestamps: null, etdTimestamps: null, ptdTimestamps: null,
      gateInCutoff: null, documentationCutoff: null, vgmCutoff: null, dangerousGoodsCutoff: null,
      demFreeTime: null, detFreeTime: null,
    },
  ]
}

const UNIT_A = { id: 'unit-a', originLocationId: LOC.WARSAW, destinationLocationId: LOC.WAREHOUSE }
const UNIT_B = { id: 'unit-b', originLocationId: LOC.WARSAW, destinationLocationId: LOC.WAREHOUSE }

function allUnitLegs(unitId: string) {
  return [
    { unitId, legId: 'leg-truck1', atd: null as string | null, ata: null as string | null, dropoffTime: null as string | null },
    { unitId, legId: 'leg-ship', atd: null as string | null, ata: null as string | null, dropoffTime: null as string | null },
    { unitId, legId: 'leg-rail', atd: null as string | null, ata: null as string | null, dropoffTime: null as string | null },
    { unitId, legId: 'leg-truck2', atd: null as string | null, ata: null as string | null, dropoffTime: null as string | null },
  ]
}

// ─── Transport Status Progression ───────────────────────────────────────────

describe('multimodal: transport status progression', () => {
  const units = [UNIT_A]

  it('READY when fully covered, no departures', () => {
    const legs = makeMultimodalLegs()
    const unitLegs = allUnitLegs('unit-a')
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('READY')
  })

  it('IN_TRANSIT when first TRUCK departs', () => {
    const legs = makeMultimodalLegs({ truck1: { atd: '2026-03-01T08:00:00Z' } })
    const unitLegs = allUnitLegs('unit-a')
    // TRUCK ATD is on unit-leg level
    unitLegs[0].atd = '2026-03-01 08:00'
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('IN_TRANSIT')
  })

  it('IN_TRANSIT when SHIP departs (leg-level ATD)', () => {
    const legs = makeMultimodalLegs({
      truck1: { atd: '2026-03-01T08:00:00Z', ata: '2026-03-01T16:00:00Z' },
      ship: { atd: '2026-03-05T00:00:00Z' },
    })
    const unitLegs = allUnitLegs('unit-a')
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('IN_TRANSIT')
  })

  it('IN_TRANSIT when SHIP arrives and RAIL departs', () => {
    const legs = makeMultimodalLegs({
      truck1: { atd: '2026-03-01T08:00:00Z', ata: '2026-03-01T16:00:00Z' },
      ship: { atd: '2026-03-05T00:00:00Z', ata: '2026-03-25T00:00:00Z' },
      rail: { atd: '2026-03-27T00:00:00Z' },
    })
    const unitLegs = allUnitLegs('unit-a')
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('IN_TRANSIT')
  })

  it('DELIVERED when final TRUCK has ATA (unit-leg level)', () => {
    const legs = makeMultimodalLegs({
      truck1: { atd: '2026-03-01T08:00:00Z', ata: '2026-03-01T16:00:00Z' },
      ship: { atd: '2026-03-05T00:00:00Z', ata: '2026-03-25T00:00:00Z' },
      rail: { atd: '2026-03-27T00:00:00Z', ata: '2026-03-30T00:00:00Z' },
      truck2: { atd: '2026-04-01T06:00:00Z' },
    })
    const unitLegs = allUnitLegs('unit-a')
    unitLegs[3].ata = '2026-04-01 14:00' // final TRUCK delivery
    expect(computeTransportStatus(units, legs, unitLegs)).toBe('DELIVERED')
  })

  it('PARTIALLY_DELIVERED with two final legs, one with ATA', () => {
    // Two separate final legs at same sequence, one has ATA
    const units = [
      { id: 'unit-a', originLocationId: LOC.WARSAW, destinationLocationId: LOC.WAREHOUSE },
      { id: 'unit-b', originLocationId: LOC.WARSAW, destinationLocationId: LOC.WAREHOUSE },
    ]
    const legs = [
      { id: 'leg-shared', legSequence: 1, type: 'SHIP',
        originLocationId: LOC.WARSAW, destinationLocationId: LOC.WAREHOUSE,
        atdTimestamps: ts('2026-03-01T00:00:00Z'),
        ataTimestamps: null },
      // Two final legs at sequence 2: one delivered, one not
      { id: 'leg-final-a', legSequence: 2, type: 'TRUCK',
        originLocationId: LOC.WAREHOUSE, destinationLocationId: LOC.WAREHOUSE,
        atdTimestamps: null,
        ataTimestamps: ts('2026-04-01T00:00:00Z') }, // ATA = delivered
      { id: 'leg-final-b', legSequence: 2, type: 'TRUCK',
        originLocationId: LOC.WAREHOUSE, destinationLocationId: LOC.WAREHOUSE,
        atdTimestamps: null,
        ataTimestamps: null }, // no ATA = not delivered
    ]
    const unitLegs = [
      { unitId: 'unit-a', legId: 'leg-shared', atd: null, ata: null },
      { unitId: 'unit-a', legId: 'leg-final-a', atd: null, ata: null },
      { unitId: 'unit-b', legId: 'leg-shared', atd: null, ata: null },
      { unitId: 'unit-b', legId: 'leg-final-b', atd: null, ata: null },
    ]

    expect(computeTransportStatus(units, legs, unitLegs)).toBe('PARTIALLY_DELIVERED')
  })

  it('PLANNING when unit is only assigned to 2 of 4 legs', () => {
    const legs = makeMultimodalLegs()
    const partialUnitLegs = [
      { unitId: 'unit-a', legId: 'leg-truck1', atd: null, ata: null },
      { unitId: 'unit-a', legId: 'leg-ship', atd: null, ata: null },
      // missing RAIL and final TRUCK
    ]
    expect(computeTransportStatus(units, legs, partialUnitLegs)).toBe('PLANNING')
  })
})

// ─── Leg Coverage ───────────────────────────────────────────────────────────

describe('multimodal: leg coverage', () => {
  const legs = makeMultimodalLegs()

  it('returns 4/4 when unit assigned to all 4 connected legs', () => {
    const unitLegs = allUnitLegs('unit-a')
    expect(computeLegCoverage('unit-a', LOC.WARSAW, LOC.WAREHOUSE, unitLegs, legs)).toBe('4/4')
  })

  it('returns 2/4 when assigned to TRUCK1 + SHIP only', () => {
    const partial = [
      { unitId: 'unit-a', legId: 'leg-truck1' },
      { unitId: 'unit-a', legId: 'leg-ship' },
    ]
    expect(computeLegCoverage('unit-a', LOC.WARSAW, LOC.WAREHOUSE, partial, legs)).toBe('2/4')
  })

  it('returns 1/4 when chain breaks (SHIP dest ≠ TRUCK2 origin)', () => {
    const brokenLegs = makeMultimodalLegs()
    // Break the chain: RAIL origin doesn't match SHIP dest
    brokenLegs[2].originLocationId = 'loc-wrong'
    const unitLegs = allUnitLegs('unit-a')
    // Chain walks: WARSAW→GDYNIA(truck1) → GDYNIA→SHANGHAI(ship) → stops (RAIL origin is wrong)
    expect(computeLegCoverage('unit-a', LOC.WARSAW, LOC.WAREHOUSE, unitLegs, brokenLegs)).toBe('2/4')
  })

  it('returns 0/4 when unassigned', () => {
    expect(computeLegCoverage('unit-a', LOC.WARSAW, LOC.WAREHOUSE, [], legs)).toBe('0/4')
  })
})

// ─── Warnings ───────────────────────────────────────────────────────────────

describe('multimodal: warnings', () => {
  afterEach(() => { vi.useRealTimers() })

  it('detects route gap when SHIP dest ≠ RAIL origin', () => {
    const legs = makeMultimodalLegs()
    legs[2].originLocationId = 'loc-wrong' // RAIL origin breaks chain
    const unit = { ...UNIT_A, cargoType: 'FCL', containerNumber: 'CONT001', containerType: '40HC', commodityDescription: null }
    const unitLegs = allUnitLegs('unit-a')

    const warnings = computeFileWarnings([unit], legs, unitLegs)
    const gap = warnings.find((w) => w.type === 'route_gap')
    expect(gap).toBeDefined()
    expect(gap!.message).toContain('leg 2')
    expect(gap!.message).toContain('leg 3')
  })

  it('detects schedule conflict: SHIP arrival after RAIL departure', () => {
    const legs = makeMultimodalLegs({
      ship: { ata: '2026-03-30T00:00:00Z' }, // arrives March 30
      rail: { atd: '2026-03-28T00:00:00Z' }, // departed March 28 — conflict!
    })
    const unit = { ...UNIT_A, cargoType: 'FCL', containerNumber: null, containerType: null, commodityDescription: null }
    // Schedule conflict checks use unit-leg timestamps with leg-level fallback.
    // The unit-leg records need to reference the leg IDs so the per-unit lookup works.
    const unitLegs = allUnitLegs('unit-a')
    // Set unit-level timestamps matching the leg-level ones for conflict detection
    unitLegs[1].ata = '2026-03-30T00:00:00Z' // SHIP arrival
    unitLegs[2].atd = '2026-03-28T00:00:00Z' // RAIL departure — before SHIP arrival

    const warnings = computeFileWarnings([unit], legs, unitLegs)
    const conflict = warnings.find((w) => w.type === 'schedule_conflict')
    expect(conflict).toBeDefined()
    expect(conflict!.severity).toBe('warning')
  })

  it('no schedule conflict when SHIP arrives before RAIL departs', () => {
    const legs = makeMultimodalLegs({
      ship: { ata: '2026-03-25T00:00:00Z' },
      rail: { atd: '2026-03-28T00:00:00Z' },
    })
    const unit = { ...UNIT_A, cargoType: 'FCL', containerNumber: null, containerType: null, commodityDescription: null }
    const unitLegs = allUnitLegs('unit-a')

    const warnings = computeFileWarnings([unit], legs, unitLegs)
    expect(warnings.find((w) => w.type === 'schedule_conflict')).toBeUndefined()
  })

  it('detects TRUCK1 unit-leg schedule conflict with SHIP departure', () => {
    const legs = makeMultimodalLegs()
    const unit = { ...UNIT_A, cargoType: 'FCL', containerNumber: null, containerType: null, commodityDescription: null }
    const unitLegs = allUnitLegs('unit-a')
    unitLegs[0].ata = '2026-03-10T00:00:00Z' // TRUCK1 arrives March 10
    unitLegs[1].atd = '2026-03-05T00:00:00Z' // SHIP departs March 5 — conflict!

    // leg-level SHIP departure via SCD
    legs[1].ptdTimestamps = ts('2026-03-05T00:00:00Z')

    const warnings = computeFileWarnings([unit], legs, unitLegs)
    const conflict = warnings.find((w) => w.type === 'schedule_conflict')
    expect(conflict).toBeDefined()
  })

  it('detects gate-in cutoff approaching on SHIP while TRUCK1 in transit', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T00:00:00Z'))

    const legs = makeMultimodalLegs({
      truck1: { atd: '2026-03-07T08:00:00Z' }, // TRUCK1 departed, still in transit
    })
    // Gate-in cutoff in 24h (< 48h threshold)
    legs[1].gateInCutoff = '2026-03-09T00:00:00Z'

    const warnings = computeFileWarnings([], legs, [])
    const cutoff = warnings.find((w) => w.type === 'cutoff_approaching')
    expect(cutoff).toBeDefined()
    expect(cutoff!.message).toContain('Gate-in cutoff')
  })

  it('detects D&D risk on SHIP leg after arrival', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T00:00:00Z'))

    const legs = makeMultimodalLegs({
      ship: { ata: '2026-03-20T00:00:00Z', demFreeTime: 5 },
    })
    // No RAIL departure yet — 10 days since SHIP arrival, 5 day free time exceeded

    const warnings = computeFileWarnings([], legs, [])
    const demRisk = warnings.find((w) => w.type === 'dem_det_risk' && w.message.includes('Demurrage'))
    expect(demRisk).toBeDefined()
    expect(demRisk!.severity).toBe('critical')
  })

  it('detects planned schedule exceeds D&D on SHIP when RAIL departure is set', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))

    const legs = makeMultimodalLegs({
      ship: { eta: '2026-03-10T00:00:00Z', demFreeTime: 3 },
      rail: { atd: '2026-03-20T00:00:00Z' }, // 10 day dwell vs 3 day free time
    })

    const warnings = computeFileWarnings([], legs, [])
    const exceeded = warnings.find((w) => w.type === 'dem_det_plan_exceeded' && w.message.includes('demurrage'))
    expect(exceeded).toBeDefined()
    expect(exceeded!.severity).toBe('warning')
  })

  it('warns about missing pickup leg after RAIL with D&D set', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T00:00:00Z'))

    // Only 3 legs: TRUCK → SHIP → RAIL (no final TRUCK)
    const legs = makeMultimodalLegs({
      rail: { ata: '2026-03-28T00:00:00Z' },
    }).slice(0, 3)
    legs[2].demFreeTime = 5

    const warnings = computeFileWarnings([], legs, [])
    const noPickup = warnings.find((w) => w.message.includes('No pickup leg'))
    expect(noPickup).toBeDefined()
  })
})

// ─── D&D Exposure ───────────────────────────────────────────────────────────

describe('multimodal: D&D exposure', () => {
  const fixedNow = new Date('2026-04-05T00:00:00Z')

  it('computes demurrage on SHIP leg with RAIL as pickup', () => {
    const legs = [
      { id: 'leg-ship', legSequence: 2, type: 'SHIP' as const,
        ataTimestamps: ts('2026-03-20T00:00:00Z'), atdTimestamps: null,
        demFreeTime: 5, detFreeTime: null },
      { id: 'leg-rail', legSequence: 3, type: 'RAIL' as const,
        ataTimestamps: null, atdTimestamps: ts('2026-03-27T00:00:00Z'),
        demFreeTime: null, detFreeTime: null },
    ]
    const units = [{ id: 'unit-a', containerNumber: 'CONT001' }]
    // Unit must be assigned to SHIP leg for per-unit D&D calculation
    const unitLegs = [
      { unitId: 'unit-a', legId: 'leg-ship', atd: null, ata: null, dropoffTime: null },
      { unitId: 'unit-a', legId: 'leg-rail', atd: null, ata: null, dropoffTime: null },
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)
    const dem = result.find((e) => e.type === 'demurrage' && e.legId === 'leg-ship')
    expect(dem).toBeDefined()
    // RAIL is non-TRUCK, so pickup = leg-level ATD = Mar 27
    // ATA Mar 20 → RAIL ATD Mar 27 = 7 days elapsed, 5 days free → 2 overdue
    expect(dem!.elapsedDays).toBe(7)
    expect(dem!.overdueDays).toBe(2)
    expect(dem!.status).toBe('overdue')
  })

  it('computes demurrage on RAIL leg with TRUCK as pickup', () => {
    const legs = [
      { id: 'leg-rail', legSequence: 3, type: 'RAIL' as const,
        ataTimestamps: ts('2026-03-30T00:00:00Z'), atdTimestamps: null,
        demFreeTime: 3, detFreeTime: null },
      { id: 'leg-truck2', legSequence: 4, type: 'TRUCK' as const,
        ataTimestamps: null, atdTimestamps: null,
        demFreeTime: null, detFreeTime: null },
    ]
    const units = [{ id: 'unit-a', containerNumber: 'CONT001' }]
    const unitLegs = [
      { unitId: 'unit-a', legId: 'leg-rail', atd: null, ata: null, dropoffTime: null },
      { unitId: 'unit-a', legId: 'leg-truck2', atd: '2026-04-01 08:00', ata: null, dropoffTime: null },
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)
    const dem = result.find((e) => e.type === 'demurrage')
    expect(dem).toBeDefined()
    // ATA Mar 30 → TRUCK ATD Apr 1 = 2 days (approaching: 2 >= 3-2)
    expect(dem!.elapsedDays).toBe(2)
    expect(dem!.status).toBe('approaching')
  })

  it('computes independent D&D on both SHIP and RAIL legs', () => {
    const legs = [
      { id: 'leg-ship', legSequence: 2, type: 'SHIP' as const,
        ataTimestamps: ts('2026-03-15T00:00:00Z'), atdTimestamps: null,
        demFreeTime: 7, detFreeTime: 10 },
      { id: 'leg-rail', legSequence: 3, type: 'RAIL' as const,
        ataTimestamps: ts('2026-03-25T00:00:00Z'), atdTimestamps: ts('2026-03-22T00:00:00Z'),
        demFreeTime: 3, detFreeTime: null },
      { id: 'leg-truck2', legSequence: 4, type: 'TRUCK' as const,
        ataTimestamps: null, atdTimestamps: null,
        demFreeTime: null, detFreeTime: null },
    ]

    const result = computeDemDetExposure(legs, [], [], fixedNow)

    const shipDem = result.find((e) => e.legId === 'leg-ship' && e.type === 'demurrage')
    const railDem = result.find((e) => e.legId === 'leg-rail' && e.type === 'demurrage')
    expect(shipDem).toBeDefined()
    expect(railDem).toBeDefined()
    // Both independently calculated
    expect(shipDem!.freeTimeDays).toBe(7)
    expect(railDem!.freeTimeDays).toBe(3)
  })

  it('computes detention on SHIP when TRUCK pickup and dropoff are known', () => {
    const legs = [
      { id: 'leg-ship', legSequence: 2, type: 'SHIP' as const,
        ataTimestamps: ts('2026-03-15T00:00:00Z'), atdTimestamps: null,
        demFreeTime: null, detFreeTime: 7 },
      { id: 'leg-truck2', legSequence: 3, type: 'TRUCK' as const,
        ataTimestamps: null, atdTimestamps: null,
        demFreeTime: null, detFreeTime: null },
    ]
    const units = [{ id: 'unit-a', containerNumber: 'CONT001' }]
    const unitLegs = [
      { unitId: 'unit-a', legId: 'leg-ship', atd: null, ata: null, dropoffTime: null },
      { unitId: 'unit-a', legId: 'leg-truck2', atd: '2026-03-18 08:00', ata: '2026-03-18 16:00', dropoffTime: '2026-03-22 10:00' },
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)
    const det = result.find((e) => e.type === 'detention')
    expect(det).toBeDefined()
    // pickup Mar 18 → dropoff Mar 22 = 4 days, free time 7 → within free time
    expect(det!.elapsedDays).toBe(4)
    expect(det!.status).toBe('within_free_time')
  })

  it('uses now as detention end when container not yet returned', () => {
    const legs = [
      { id: 'leg-ship', legSequence: 2, type: 'SHIP' as const,
        ataTimestamps: ts('2026-03-15T00:00:00Z'), atdTimestamps: null,
        demFreeTime: null, detFreeTime: 5 },
      { id: 'leg-truck2', legSequence: 3, type: 'TRUCK' as const,
        ataTimestamps: null, atdTimestamps: null,
        demFreeTime: null, detFreeTime: null },
    ]
    const units = [{ id: 'unit-a', containerNumber: 'CONT001' }]
    const unitLegs = [
      { unitId: 'unit-a', legId: 'leg-ship', atd: null, ata: null, dropoffTime: null },
      { unitId: 'unit-a', legId: 'leg-truck2', atd: '2026-03-18 08:00', ata: null, dropoffTime: null },
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)
    const det = result.find((e) => e.type === 'detention')
    expect(det).toBeDefined()
    // pickup "2026-03-18 08:00" → normalized to 2026-03-18T08:00:00Z
    // now Apr 5 00:00Z - Mar 18 08:00Z = 17.67 days → floor = 17
    expect(det!.elapsedDays).toBe(17)
    expect(det!.overdueDays).toBe(12)
    expect(det!.status).toBe('overdue')
    expect(det!.endDate).toBeNull()
  })

  it('computes per-unit D&D when two units on same SHIP leg', () => {
    const legs = [
      { id: 'leg-ship', legSequence: 2, type: 'SHIP' as const,
        ataTimestamps: ts('2026-03-15T00:00:00Z'), atdTimestamps: null,
        demFreeTime: 5, detFreeTime: null },
      { id: 'leg-truck2', legSequence: 3, type: 'TRUCK' as const,
        ataTimestamps: null, atdTimestamps: null,
        demFreeTime: null, detFreeTime: null },
    ]
    const units = [
      { id: 'unit-a', containerNumber: 'CONT-A' },
      { id: 'unit-b', containerNumber: 'CONT-B' },
    ]
    const unitLegs = [
      { unitId: 'unit-a', legId: 'leg-ship', atd: null, ata: null, dropoffTime: null },
      { unitId: 'unit-b', legId: 'leg-ship', atd: null, ata: null, dropoffTime: null },
      // Unit A picked up day 3, Unit B day 7
      { unitId: 'unit-a', legId: 'leg-truck2', atd: '2026-03-18 08:00', ata: null, dropoffTime: null },
      { unitId: 'unit-b', legId: 'leg-truck2', atd: '2026-03-22 08:00', ata: null, dropoffTime: null },
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)
    const demA = result.find((e) => e.unitId === 'unit-a' && e.type === 'demurrage')
    const demB = result.find((e) => e.unitId === 'unit-b' && e.type === 'demurrage')

    expect(demA!.elapsedDays).toBe(3) // Mar 15 → Mar 18
    expect(demA!.containerNumber).toBe('CONT-A')
    expect(demA!.status).toBe('approaching') // 3 >= 5-2

    expect(demB!.elapsedDays).toBe(7) // Mar 15 → Mar 22
    expect(demB!.containerNumber).toBe('CONT-B')
    expect(demB!.status).toBe('overdue') // 7 > 5
  })
})

// ─── Unit-Leg Status per Leg Type ───────────────────────────────────────────

describe('multimodal: unit-leg status per leg type', () => {
  afterEach(() => { vi.useRealTimers() })

  it('TRUCK leg: uses unit-level timestamps only', () => {
    expect(deriveUnitLegStatus({ ptd: '2026-03-01 08:00', etd: null, atd: null, pta: null, eta: null, ata: null }, 'TRUCK')).toBe('PLANNED')
    expect(deriveUnitLegStatus({ ptd: null, etd: null, atd: '2026-03-01 09:00', pta: null, eta: null, ata: null }, 'TRUCK')).toBe('DEPARTED')
    expect(deriveUnitLegStatus({ ptd: null, etd: null, atd: '2026-03-01 09:00', pta: null, eta: null, ata: '2026-03-01 16:00' }, 'TRUCK')).toBe('ARRIVED')
  })

  it('SHIP leg: PRE_ARRIVAL when ETA within 7 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'))

    expect(deriveUnitLegStatus(
      { ptd: null, etd: null, atd: '2026-03-05T00:00:00Z', pta: null, eta: '2026-03-25T00:00:00Z', ata: null },
      'SHIP',
    )).toBe('PRE_ARRIVAL')
  })

  it('SHIP leg: DEPARTED when ETA is far away', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-05T00:00:00Z'))

    expect(deriveUnitLegStatus(
      { ptd: null, etd: null, atd: '2026-03-05T00:00:00Z', pta: null, eta: '2026-04-15T00:00:00Z', ata: null },
      'SHIP',
    )).toBe('DEPARTED')
  })

  it('RAIL leg: no PRE_ARRIVAL (SHIP-only feature)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T00:00:00Z'))

    expect(deriveUnitLegStatus(
      { ptd: null, etd: null, atd: '2026-03-27T00:00:00Z', pta: null, eta: '2026-03-30T00:00:00Z', ata: null },
      'RAIL',
    )).toBe('DEPARTED')
  })
})
