import { describe, it, expect } from 'vitest'
import { syncLegLocationsFromShipment } from '../location-sync'

/**
 * Tests for the pure function syncLegLocationsFromShipment.
 * ensureLocationFromTracking and ensureLocationsFromShipment need DB mocks
 * and are better tested via integration tests.
 */

function makeLeg(opts: { originLocationId?: string | null; destinationLocationId?: string | null } = {}) {
  return {
    originLocationId: opts.originLocationId ?? null,
    destinationLocationId: opts.destinationLocationId ?? null,
  }
}

function makeLocodeMap(entries: Array<[string, string]>) {
  const map = new Map<string, { id: string }>()
  for (const [locode, id] of entries) {
    map.set(locode, { id } as any)
  }
  return map as any
}

describe('syncLegLocationsFromShipment', () => {
  it('sets origin when leg has no originLocationId', () => {
    const leg = makeLeg()
    const shipment = { originUnlocode: 'CNSHA', destinationUnlocode: null }
    const locodeMap = makeLocodeMap([['CNSHA', 'loc-shanghai']])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.originLocationId).toBe('loc-shanghai')
    expect(leg.destinationLocationId).toBeNull()
  })

  it('sets destination when leg has no destinationLocationId', () => {
    const leg = makeLeg()
    const shipment = { originUnlocode: null, destinationUnlocode: 'NLRTM' }
    const locodeMap = makeLocodeMap([['NLRTM', 'loc-rotterdam']])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.originLocationId).toBeNull()
    expect(leg.destinationLocationId).toBe('loc-rotterdam')
  })

  it('does NOT overwrite existing originLocationId', () => {
    const leg = makeLeg({ originLocationId: 'manual-origin' })
    const shipment = { originUnlocode: 'CNSHA', destinationUnlocode: null }
    const locodeMap = makeLocodeMap([['CNSHA', 'loc-shanghai']])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.originLocationId).toBe('manual-origin') // preserved
  })

  it('does NOT overwrite existing destinationLocationId', () => {
    const leg = makeLeg({ destinationLocationId: 'manual-dest' })
    const shipment = { originUnlocode: null, destinationUnlocode: 'NLRTM' }
    const locodeMap = makeLocodeMap([['NLRTM', 'loc-rotterdam']])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.destinationLocationId).toBe('manual-dest') // preserved
  })

  it('sets both origin and destination in one call', () => {
    const leg = makeLeg()
    const shipment = { originUnlocode: 'CNSHA', destinationUnlocode: 'NLRTM' }
    const locodeMap = makeLocodeMap([
      ['CNSHA', 'loc-shanghai'],
      ['NLRTM', 'loc-rotterdam'],
    ])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.originLocationId).toBe('loc-shanghai')
    expect(leg.destinationLocationId).toBe('loc-rotterdam')
  })

  it('does nothing when locodeMap has no matching entries', () => {
    const leg = makeLeg()
    const shipment = { originUnlocode: 'CNSHA', destinationUnlocode: 'NLRTM' }
    const locodeMap = makeLocodeMap([]) // empty map

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.originLocationId).toBeNull()
    expect(leg.destinationLocationId).toBeNull()
  })

  it('is case-insensitive on LOCODEs', () => {
    const leg = makeLeg()
    const shipment = { originUnlocode: 'cnsha', destinationUnlocode: null }
    const locodeMap = makeLocodeMap([['CNSHA', 'loc-shanghai']])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.originLocationId).toBe('loc-shanghai')
  })

  it('uses originLocation.unlocode as fallback for originUnlocode', () => {
    const leg = makeLeg()
    const shipment = {
      originUnlocode: null,
      destinationUnlocode: null,
      originLocation: { unlocode: 'CNSHA' },
    }
    const locodeMap = makeLocodeMap([['CNSHA', 'loc-shanghai']])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.originLocationId).toBe('loc-shanghai')
  })

  it('uses destinationLocation.unlocode as fallback for destinationUnlocode', () => {
    const leg = makeLeg()
    const shipment = {
      originUnlocode: null,
      destinationUnlocode: null,
      destinationLocation: { unlocode: 'NLRTM' },
    }
    const locodeMap = makeLocodeMap([['NLRTM', 'loc-rotterdam']])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.destinationLocationId).toBe('loc-rotterdam')
  })

  it('prefers originUnlocode over originLocation.unlocode', () => {
    const leg = makeLeg()
    const shipment = {
      originUnlocode: 'SGSIN',
      destinationUnlocode: null,
      originLocation: { unlocode: 'CNSHA' },
    }
    const locodeMap = makeLocodeMap([
      ['SGSIN', 'loc-singapore'],
      ['CNSHA', 'loc-shanghai'],
    ])

    syncLegLocationsFromShipment(leg, shipment, locodeMap)

    expect(leg.originLocationId).toBe('loc-singapore')
  })
})
