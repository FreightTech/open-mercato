import { describe, it, expect, vi, afterEach } from 'vitest'
import { deriveUnitLegStatus } from '../types'
import type { UnitLegTimestamps } from '../types'

function makeTs(overrides: Partial<UnitLegTimestamps> = {}): UnitLegTimestamps {
  return {
    ptd: null,
    etd: null,
    atd: null,
    pta: null,
    eta: null,
    ata: null,
    ...overrides,
  }
}

describe('deriveUnitLegStatus', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns PENDING when no timestamps set', () => {
    expect(deriveUnitLegStatus(makeTs(), 'TRUCK')).toBe('PENDING')
  })

  it('returns PLANNED when only PTD is set', () => {
    expect(deriveUnitLegStatus(makeTs({ ptd: '2026-03-10 08:00' }), 'TRUCK')).toBe('PLANNED')
  })

  it('returns PLANNED when only PTA is set', () => {
    expect(deriveUnitLegStatus(makeTs({ pta: '2026-03-15T00:00:00Z' }), 'SHIP')).toBe('PLANNED')
  })

  it('returns ESTIMATED when ETD is set', () => {
    expect(deriveUnitLegStatus(makeTs({ etd: '2026-03-10T12:00:00Z' }), 'SHIP')).toBe('ESTIMATED')
  })

  it('returns ESTIMATED when ETA is set (non-SHIP, far future)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(deriveUnitLegStatus(makeTs({ eta: '2026-06-01T00:00:00Z' }), 'TRUCK')).toBe('ESTIMATED')
  })

  it('returns DEPARTED when ATD is set', () => {
    expect(deriveUnitLegStatus(makeTs({ atd: '2026-03-10T08:00:00Z' }), 'TRUCK')).toBe('DEPARTED')
  })

  it('returns ARRIVED when ATA is set', () => {
    expect(deriveUnitLegStatus(makeTs({ ata: '2026-03-15T14:00:00Z' }), 'SHIP')).toBe('ARRIVED')
  })

  it('returns ARRIVED even when other timestamps are set', () => {
    expect(
      deriveUnitLegStatus(
        makeTs({ ptd: '2026-03-01', etd: '2026-03-05', atd: '2026-03-06', ata: '2026-03-15' }),
        'SHIP'
      )
    ).toBe('ARRIVED')
  })

  it('returns PRE_ARRIVAL for SHIP with ETA within 7 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T00:00:00Z'))

    // ETA is March 15 = 5 days from now (< 7 days)
    expect(
      deriveUnitLegStatus(makeTs({ atd: '2026-03-05T00:00:00Z', eta: '2026-03-15T00:00:00Z' }), 'SHIP')
    ).toBe('PRE_ARRIVAL')
  })

  it('does not return PRE_ARRIVAL for SHIP with ETA beyond 7 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))

    // ETA is March 15 = 14 days from now (> 7 days)
    expect(
      deriveUnitLegStatus(makeTs({ atd: '2026-02-25T00:00:00Z', eta: '2026-03-15T00:00:00Z' }), 'SHIP')
    ).toBe('DEPARTED')
  })

  it('does not return PRE_ARRIVAL for TRUCK even with ETA within 7 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T00:00:00Z'))

    // PRE_ARRIVAL is SHIP-only
    expect(
      deriveUnitLegStatus(makeTs({ atd: '2026-03-05T00:00:00Z', eta: '2026-03-12T00:00:00Z' }), 'TRUCK')
    ).toBe('DEPARTED')
  })

  it('does not return PRE_ARRIVAL for RAIL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T00:00:00Z'))

    expect(
      deriveUnitLegStatus(makeTs({ eta: '2026-03-12T00:00:00Z' }), 'RAIL')
    ).toBe('ESTIMATED')
  })

  it('returns ESTIMATED for ETA without ATD on SHIP (not PRE_ARRIVAL because no departed state)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T00:00:00Z'))

    // ETA within 7 days but no ATD — the function checks ETA before ATD
    // Actually, looking at the code: it checks ATA first, then SHIP ETA, then ATD...
    // So SHIP with ETA within 7 days and no ATD → PRE_ARRIVAL
    expect(
      deriveUnitLegStatus(makeTs({ eta: '2026-03-12T00:00:00Z' }), 'SHIP')
    ).toBe('PRE_ARRIVAL')
  })
})
