import { describe, it, expect } from 'vitest'
import { computeDemDetExposure } from '../dem-det'
import type { DemDetExposure } from '../dem-det'

// ─── Factories ──────────────────────────────────────────────────────────────

function makeShipLeg(
  id: string,
  seq: number,
  opts: {
    ata?: string
    atd?: string
    demFreeTime?: number
    detFreeTime?: number
  } = {}
) {
  return {
    id,
    legSequence: seq,
    type: 'SHIP' as const,
    ataTimestamps: opts.ata
      ? [{ value: opts.ata, offset: null, source: 'manual' as const, updatedAt: opts.ata }]
      : null,
    atdTimestamps: opts.atd
      ? [{ value: opts.atd, offset: null, source: 'manual' as const, updatedAt: opts.atd }]
      : null,
    demFreeTime: opts.demFreeTime ?? null,
    detFreeTime: opts.detFreeTime ?? null,
  }
}

function makeTruckLeg(id: string, seq: number) {
  return {
    id,
    legSequence: seq,
    type: 'TRUCK' as const,
    ataTimestamps: null,
    atdTimestamps: null,
    demFreeTime: null,
    detFreeTime: null,
  }
}

function makeUnit(id: string, containerNumber?: string) {
  return { id, containerNumber: containerNumber ?? null }
}

function makeUnitLeg(
  unitId: string,
  legId: string,
  opts: { atd?: string; ata?: string; dropoffTime?: string } = {}
) {
  return {
    unitId,
    legId,
    atd: opts.atd ?? null,
    ata: opts.ata ?? null,
    dropoffTime: opts.dropoffTime ?? null,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('computeDemDetExposure', () => {
  const fixedNow = new Date('2026-03-20T00:00:00Z')

  it('returns empty for TRUCK-only legs', () => {
    const legs = [makeTruckLeg('l1', 1)]
    expect(computeDemDetExposure(legs, [], [], fixedNow)).toEqual([])
  })

  it('returns empty for SHIP leg without ATA', () => {
    const legs = [makeShipLeg('l1', 1, { demFreeTime: 5 })]
    expect(computeDemDetExposure(legs, [], [], fixedNow)).toEqual([])
  })

  it('returns empty for SHIP leg with ATA but no free time set', () => {
    const legs = [makeShipLeg('l1', 1, { ata: '2026-03-10T00:00:00Z' })]
    expect(computeDemDetExposure(legs, [], [], fixedNow)).toEqual([])
  })

  it('computes demurrage at leg level when no units assigned', () => {
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-10T00:00:00Z', demFreeTime: 5 }),
    ]
    const result = computeDemDetExposure(legs, [], [], fixedNow)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      legId: 'l1',
      type: 'demurrage',
      freeTimeDays: 5,
      elapsedDays: 10,
      overdueDays: 5,
      startDate: '2026-03-10T00:00:00Z',
      endDate: null, // no pickup → uses now, endDate is null
      status: 'overdue',
      unitId: null,
    })
  })

  it('computes demurrage within free time', () => {
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-18T00:00:00Z', demFreeTime: 5 }),
    ]
    const result = computeDemDetExposure(legs, [], [], fixedNow)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      elapsedDays: 2,
      overdueDays: 0,
      status: 'within_free_time',
    })
  })

  it('computes demurrage approaching status', () => {
    // elapsed = 4, freeTime = 5, threshold = 2 → approaching (4 >= 5-2)
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-16T00:00:00Z', demFreeTime: 5 }),
    ]
    const result = computeDemDetExposure(legs, [], [], fixedNow)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      elapsedDays: 4,
      overdueDays: 0,
      status: 'approaching',
    })
  })

  it('computes per-unit demurrage with TRUCK pickup', () => {
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-10T00:00:00Z', demFreeTime: 5 }),
      makeTruckLeg('l2', 2),
    ]
    const units = [makeUnit('u1', 'CONT001')]
    const unitLegs = [
      makeUnitLeg('u1', 'l1'),
      makeUnitLeg('u1', 'l2', { atd: '2026-03-13T00:00:00Z' }),
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)

    const dem = result.find((e) => e.type === 'demurrage')
    expect(dem).toBeDefined()
    expect(dem!.unitId).toBe('u1')
    expect(dem!.containerNumber).toBe('CONT001')
    expect(dem!.elapsedDays).toBe(3) // Mar 10 → Mar 13
    expect(dem!.status).toBe('approaching') // 3 >= 5-2
    expect(dem!.endDate).toBeTruthy() // pickup date is set
  })

  it('computes detention when container has been picked up', () => {
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-05T00:00:00Z', demFreeTime: 3, detFreeTime: 7 }),
      makeTruckLeg('l2', 2),
    ]
    const units = [makeUnit('u1', 'CONT001')]
    const unitLegs = [
      makeUnitLeg('u1', 'l1'),
      makeUnitLeg('u1', 'l2', { atd: '2026-03-07T00:00:00Z' }), // picked up
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)

    const det = result.find((e) => e.type === 'detention')
    expect(det).toBeDefined()
    expect(det!.startDate).toBe(new Date('2026-03-07T00:00:00Z').toISOString())
    expect(det!.elapsedDays).toBe(13) // Mar 7 → Mar 20
    expect(det!.overdueDays).toBe(6) // 13 - 7
    expect(det!.status).toBe('overdue')
  })

  it('uses dropoffTime for TRUCK detention end date', () => {
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-05T00:00:00Z', detFreeTime: 7 }),
      makeTruckLeg('l2', 2),
    ]
    const units = [makeUnit('u1', 'CONT001')]
    const unitLegs = [
      makeUnitLeg('u1', 'l1'),
      makeUnitLeg('u1', 'l2', {
        atd: '2026-03-07T00:00:00Z',
        dropoffTime: '2026-03-12T00:00:00Z', // container returned
      }),
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)

    const det = result.find((e) => e.type === 'detention')
    expect(det).toBeDefined()
    expect(det!.elapsedDays).toBe(5) // Mar 7 → Mar 12
    expect(det!.overdueDays).toBe(0)
    expect(det!.status).toBe('approaching') // 5 >= 7-2
    expect(det!.endDate).toBeTruthy()
  })

  it('does not compute detention without pickup', () => {
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-10T00:00:00Z', detFreeTime: 5 }),
      makeTruckLeg('l2', 2),
    ]
    const units = [makeUnit('u1')]
    const unitLegs = [
      makeUnitLeg('u1', 'l1'),
      makeUnitLeg('u1', 'l2'), // no ATD = no pickup
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)
    expect(result.every((e) => e.type === 'demurrage')).toBe(true)
  })

  it('handles RAIL legs same as SHIP', () => {
    const legs = [{
      id: 'l1',
      legSequence: 1,
      type: 'RAIL' as const,
      ataTimestamps: [{ value: '2026-03-15T00:00:00Z', offset: null, source: 'manual' as const, updatedAt: '2026-03-15T00:00:00Z' }],
      atdTimestamps: null,
      demFreeTime: 3,
      detFreeTime: null,
    }]

    const result = computeDemDetExposure(legs, [], [], fixedNow)
    expect(result).toHaveLength(1)
    expect(result[0].elapsedDays).toBe(5) // Mar 15 → Mar 20
  })

  it('skips AIR legs', () => {
    const legs = [{
      id: 'l1',
      legSequence: 1,
      type: 'AIR' as const,
      ataTimestamps: [{ value: '2026-03-15T00:00:00Z', offset: null, source: 'manual' as const, updatedAt: '2026-03-15T00:00:00Z' }],
      atdTimestamps: null,
      demFreeTime: 3,
      detFreeTime: null,
    }]

    expect(computeDemDetExposure(legs, [], [], fixedNow)).toEqual([])
  })

  it('handles TRUCK timestamps in "YYYY-MM-DD HH:mm" format', () => {
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-10T00:00:00Z', demFreeTime: 5 }),
      makeTruckLeg('l2', 2),
    ]
    const units = [makeUnit('u1')]
    const unitLegs = [
      makeUnitLeg('u1', 'l1'),
      makeUnitLeg('u1', 'l2', { atd: '2026-03-12 08:00' }), // TRUCK format
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)
    const dem = result.find((e) => e.type === 'demurrage')
    expect(dem).toBeDefined()
    expect(dem!.elapsedDays).toBe(2) // Mar 10 → Mar 12
  })

  it('computes multiple units independently', () => {
    const legs = [
      makeShipLeg('l1', 1, { ata: '2026-03-10T00:00:00Z', demFreeTime: 5 }),
      makeTruckLeg('l2', 2),
    ]
    const units = [makeUnit('u1', 'CONT-A'), makeUnit('u2', 'CONT-B')]
    const unitLegs = [
      makeUnitLeg('u1', 'l1'),
      makeUnitLeg('u2', 'l1'),
      makeUnitLeg('u1', 'l2', { atd: '2026-03-12T00:00:00Z' }),
      makeUnitLeg('u2', 'l2'), // not picked up yet
    ]

    const result = computeDemDetExposure(legs, unitLegs, units, fixedNow)
    const demU1 = result.find((e) => e.type === 'demurrage' && e.unitId === 'u1')
    const demU2 = result.find((e) => e.type === 'demurrage' && e.unitId === 'u2')

    expect(demU1!.elapsedDays).toBe(2) // picked up Mar 12
    expect(demU1!.containerNumber).toBe('CONT-A')
    expect(demU2!.elapsedDays).toBe(10) // still at port (uses now)
    expect(demU2!.containerNumber).toBe('CONT-B')
  })
})
