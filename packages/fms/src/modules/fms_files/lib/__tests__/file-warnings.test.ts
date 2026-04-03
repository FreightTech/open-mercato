import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeFileWarnings, computeLegCoverage } from '../file-warnings'
import type { FileWarning } from '../file-warnings'

// ─── Factories ──────────────────────────────────────────────────────────────

function makeUnit(
  id: string,
  opts: {
    cargoType?: string
    origin?: string
    dest?: string
    containerNumber?: string
    containerType?: string
    commodityDescription?: string
  } = {}
) {
  return {
    id,
    cargoType: opts.cargoType ?? 'FCL',
    originLocationId: opts.origin ?? null,
    destinationLocationId: opts.dest ?? null,
    containerNumber: opts.containerNumber ?? null,
    containerType: opts.containerType ?? null,
    commodityDescription: opts.commodityDescription ?? null,
  }
}

function makeLeg(
  id: string,
  seq: number,
  opts: {
    type?: string
    origin?: string
    dest?: string
    atd?: string
    ata?: string
    eta?: string
    pta?: string
    etd?: string
    ptd?: string
    gateInCutoff?: string
    documentationCutoff?: string
    vgmCutoff?: string
    dangerousGoodsCutoff?: string
    demFreeTime?: number
    detFreeTime?: number
  } = {}
) {
  const ts = (val?: string) =>
    val ? [{ value: val, offset: null, source: 'manual' as const, updatedAt: val }] : null

  return {
    id,
    legSequence: seq,
    type: opts.type ?? 'SHIP',
    originLocationId: opts.origin ?? null,
    destinationLocationId: opts.dest ?? null,
    atdTimestamps: ts(opts.atd),
    ataTimestamps: ts(opts.ata),
    etaTimestamps: ts(opts.eta),
    ptaTimestamps: ts(opts.pta),
    etdTimestamps: ts(opts.etd),
    ptdTimestamps: ts(opts.ptd),
    gateInCutoff: opts.gateInCutoff ?? null,
    documentationCutoff: opts.documentationCutoff ?? null,
    vgmCutoff: opts.vgmCutoff ?? null,
    dangerousGoodsCutoff: opts.dangerousGoodsCutoff ?? null,
    demFreeTime: opts.demFreeTime ?? null,
    detFreeTime: opts.detFreeTime ?? null,
  }
}

function makeUnitLeg(
  unitId: string,
  legId: string,
  opts: {
    atd?: string
    ata?: string
    eta?: string
    etd?: string
    ptd?: string
    pta?: string
    dropoffTime?: string
  } = {}
) {
  return {
    unitId,
    legId,
    atd: opts.atd ?? null,
    ata: opts.ata ?? null,
    eta: opts.eta ?? null,
    etd: opts.etd ?? null,
    ptd: opts.ptd ?? null,
    pta: opts.pta ?? null,
    dropoffTime: opts.dropoffTime ?? null,
  }
}

function findWarning(warnings: FileWarning[], type: string): FileWarning | undefined {
  return warnings.find((w) => w.type === type)
}

// ─── computeFileWarnings ────────────────────────────────────────────────────

describe('computeFileWarnings', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty for no legs', () => {
    expect(computeFileWarnings([makeUnit('u1')], [], [])).toEqual([])
  })

  it('detects unassigned unit', () => {
    const units = [makeUnit('u1', { containerNumber: 'CONT001', containerType: '40HC' })]
    const legs = [makeLeg('l1', 1)]
    const warnings = computeFileWarnings(units, legs, [])

    const w = findWarning(warnings, 'unassigned_unit')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('info')
    expect(w!.affectedItems[0]).toContain('CONT001')
  })

  it('detects origin mismatch', () => {
    const units = [makeUnit('u1', { origin: 'A', dest: 'C' })]
    const legs = [makeLeg('l1', 1, { origin: 'B', dest: 'C' })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]

    const warnings = computeFileWarnings(units, legs, unitLegs)
    const w = findWarning(warnings, 'uncovered_unit')
    expect(w).toBeDefined()
    expect(w!.message).toContain('origin')
  })

  it('detects destination mismatch', () => {
    const units = [makeUnit('u1', { origin: 'A', dest: 'C' })]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B' })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]

    const warnings = computeFileWarnings(units, legs, unitLegs)
    const w = findWarning(warnings, 'uncovered_unit')
    expect(w).toBeDefined()
    expect(w!.message).toContain('destination')
  })

  it('skips mismatch check when location is null', () => {
    const units = [makeUnit('u1', { origin: null, dest: null })]
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B' })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]

    const warnings = computeFileWarnings(units, legs, unitLegs)
    expect(findWarning(warnings, 'uncovered_unit')).toBeUndefined()
  })

  it('detects route gap between consecutive legs', () => {
    const units = [makeUnit('u1', { origin: 'A', dest: 'D' })]
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B' }),
      makeLeg('l2', 2, { origin: 'C', dest: 'D' }), // gap: B -> C
    ]
    const unitLegs = [makeUnitLeg('u1', 'l1'), makeUnitLeg('u1', 'l2')]

    const warnings = computeFileWarnings(units, legs, unitLegs)
    const w = findWarning(warnings, 'route_gap')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('info')
  })

  it('does not flag route gap when legs connect', () => {
    const units = [makeUnit('u1', { origin: 'A', dest: 'C' })]
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B' }),
      makeLeg('l2', 2, { origin: 'B', dest: 'C' }),
    ]
    const unitLegs = [makeUnitLeg('u1', 'l1'), makeUnitLeg('u1', 'l2')]

    const warnings = computeFileWarnings(units, legs, unitLegs)
    expect(findWarning(warnings, 'route_gap')).toBeUndefined()
  })

  it('detects schedule conflict: leg N arrival after leg N+1 departure', () => {
    const units = [makeUnit('u1', { origin: 'A', dest: 'C' })]
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B', ata: '2026-03-15T00:00:00Z' }),
      makeLeg('l2', 2, { origin: 'B', dest: 'C', ptd: '2026-03-10T00:00:00Z' }), // departs before arrival
    ]
    const unitLegs = [makeUnitLeg('u1', 'l1'), makeUnitLeg('u1', 'l2')]

    const warnings = computeFileWarnings(units, legs, unitLegs)
    const w = findWarning(warnings, 'schedule_conflict')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('warning')
  })

  it('uses unit-leg level timestamps for schedule conflict', () => {
    const units = [makeUnit('u1', { origin: 'A', dest: 'C' })]
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B' }),
      makeLeg('l2', 2, { origin: 'B', dest: 'C' }),
    ]
    const unitLegs = [
      makeUnitLeg('u1', 'l1', { ata: '2026-03-15T00:00:00Z' }),
      makeUnitLeg('u1', 'l2', { atd: '2026-03-10T00:00:00Z' }), // departs before arrival
    ]

    const warnings = computeFileWarnings(units, legs, unitLegs)
    expect(findWarning(warnings, 'schedule_conflict')).toBeDefined()
  })

  it('detects cutoff_passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))

    const legs = [
      makeLeg('l1', 1, { gateInCutoff: '2026-03-19T00:00:00Z' }), // already passed
    ]

    const warnings = computeFileWarnings([], legs, [])
    const w = findWarning(warnings, 'cutoff_passed')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('critical')
    expect(w!.message).toContain('Gate-in cutoff')
  })

  it('detects cutoff_approaching', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'))

    const legs = [
      makeLeg('l1', 1, { documentationCutoff: '2026-03-21T12:00:00Z' }), // 36h away (< 48h)
    ]

    const warnings = computeFileWarnings([], legs, [])
    const w = findWarning(warnings, 'cutoff_approaching')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('warning')
    expect(w!.message).toContain('Documentation cutoff')
  })

  it('skips cutoff warnings for departed legs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'))

    const legs = [
      makeLeg('l1', 1, {
        gateInCutoff: '2026-03-19T00:00:00Z',
        atd: '2026-03-18T00:00:00Z', // already departed
      }),
    ]

    const warnings = computeFileWarnings([], legs, [])
    expect(findWarning(warnings, 'cutoff_passed')).toBeUndefined()
  })

  it('detects dem_det_risk when demurrage overdue', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'))

    const legs = [
      makeLeg('l1', 1, { type: 'SHIP', ata: '2026-03-10T00:00:00Z', demFreeTime: 5 }),
      makeLeg('l2', 2, { type: 'TRUCK' }),
    ]

    const warnings = computeFileWarnings([], legs, [])
    const w = findWarning(warnings, 'dem_det_risk')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('critical')
    expect(w!.message).toContain('Demurrage free time exceeded')
  })

  it('warns about missing pickup leg after SHIP with D&D', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'))

    const legs = [
      makeLeg('l1', 1, { type: 'SHIP', ata: '2026-03-18T00:00:00Z', demFreeTime: 5 }),
      // no next leg
    ]

    const warnings = computeFileWarnings([], legs, [])
    const w = warnings.find((w) => w.message.includes('No pickup leg'))
    expect(w).toBeDefined()
  })

  it('labels FCL unit with container number', () => {
    const units = [makeUnit('u1', { containerNumber: 'MSKU1234567', containerType: '40HC' })]
    const legs = [makeLeg('l1', 1)]
    const warnings = computeFileWarnings(units, legs, [])
    expect(warnings[0].affectedItems[0]).toContain('MSKU1234567')
    expect(warnings[0].affectedItems[0]).toContain('40HC')
  })

  it('labels LCL unit with commodity description', () => {
    const units = [makeUnit('u1', { cargoType: 'LCL', commodityDescription: 'Electronics parts' })]
    const legs = [makeLeg('l1', 1)]
    const warnings = computeFileWarnings(units, legs, [])
    expect(warnings[0].affectedItems[0]).toContain('LCL: Electronics parts')
  })

  it('detects dem_det_plan_exceeded based on estimated schedule', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))

    const legs = [
      makeLeg('l1', 1, {
        type: 'SHIP',
        eta: '2026-03-10T00:00:00Z', // estimated arrival
        demFreeTime: 3,
      }),
      makeLeg('l2', 2, {
        type: 'TRUCK',
        etd: '2026-03-20T00:00:00Z', // pickup 10 days after arrival
      }),
    ]

    const warnings = computeFileWarnings([], legs, [])
    const w = findWarning(warnings, 'dem_det_plan_exceeded')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('warning')
    expect(w!.message).toContain('demurrage')
  })
})

// ─── computeLegCoverage ─────────────────────────────────────────────────────

describe('computeLegCoverage', () => {
  it('returns 0/0 when no legs', () => {
    expect(computeLegCoverage('u1', 'A', 'B', [], [])).toBe('0/0')
  })

  it('returns 0/N when unit has no origin/destination', () => {
    const legs = [makeLeg('l1', 1)]
    expect(computeLegCoverage('u1', null, null, [], legs)).toBe('0/1')
  })

  it('returns 0/N when unit is unassigned', () => {
    const legs = [makeLeg('l1', 1), makeLeg('l2', 2)]
    expect(computeLegCoverage('u1', 'A', 'C', [], legs)).toBe('0/2')
  })

  it('returns 1/1 for single direct leg fully covering the route', () => {
    const legs = [makeLeg('l1', 1, { origin: 'A', dest: 'B' })]
    const unitLegs = [makeUnitLeg('u1', 'l1')]
    expect(computeLegCoverage('u1', 'A', 'B', unitLegs, legs)).toBe('1/1')
  })

  it('returns 2/2 for two-leg complete coverage', () => {
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B' }),
      makeLeg('l2', 2, { origin: 'B', dest: 'C' }),
    ]
    const unitLegs = [makeUnitLeg('u1', 'l1'), makeUnitLeg('u1', 'l2')]
    expect(computeLegCoverage('u1', 'A', 'C', unitLegs, legs)).toBe('2/2')
  })

  it('returns partial coverage when chain is incomplete', () => {
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B' }),
      makeLeg('l2', 2, { origin: 'B', dest: 'C' }),
      makeLeg('l3', 3, { origin: 'C', dest: 'D' }),
    ]
    const unitLegs = [makeUnitLeg('u1', 'l1')] // only assigned to first leg
    expect(computeLegCoverage('u1', 'A', 'D', unitLegs, legs)).toBe('1/3')
  })

  it('does not count legs assigned to other units', () => {
    const legs = [
      makeLeg('l1', 1, { origin: 'A', dest: 'B' }),
      makeLeg('l2', 2, { origin: 'B', dest: 'C' }),
    ]
    const unitLegs = [
      makeUnitLeg('u1', 'l1'),
      makeUnitLeg('u2', 'l2'), // different unit
    ]
    expect(computeLegCoverage('u1', 'A', 'C', unitLegs, legs)).toBe('1/2')
  })
})
