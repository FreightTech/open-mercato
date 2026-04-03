import { describe, it, expect } from 'vitest'
import {
  getCurrentVessel,
  findVesselImoFromEvents,
  getVesselStatusDescription,
} from '../current-vessel'
import type { RouteStopEntry, CargoEventEntry, CurrentVesselInfo } from '../current-vessel'

// ─── Factories ──────────────────────────────────────────────────────────────

function makeStop(
  location: string,
  type: 'origin' | 'transshipment' | 'destination',
  opts: {
    vesselName?: string
    vesselImo?: string
    ata?: string
    atd?: string
    eta?: string
    etd?: string
  } = {}
): RouteStopEntry {
  return {
    location,
    type,
    vesselName: opts.vesselName ?? null,
    vesselImo: opts.vesselImo ?? null,
    ata: opts.ata ?? null,
    atd: opts.atd ?? null,
    eta: opts.eta ?? null,
    etd: opts.etd ?? null,
  }
}

function makeEvent(
  vesselName: string,
  vesselImo?: string
): CargoEventEntry {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    eventType: 'TRANSPORT',
    eventCode: 'DEPA',
    eventDateTime: '2026-01-01T00:00:00Z',
    vesselName,
    vesselImo: vesselImo ?? null,
  }
}

// ─── findVesselImoFromEvents ────────────────────────────────────────────────

describe('findVesselImoFromEvents', () => {
  it('returns null for null vessel name', () => {
    expect(findVesselImoFromEvents(null, [makeEvent('VESSEL A', '1234567')])).toBeNull()
  })

  it('returns null for empty events', () => {
    expect(findVesselImoFromEvents('VESSEL A', [])).toBeNull()
  })

  it('returns null for null events', () => {
    expect(findVesselImoFromEvents('VESSEL A', null)).toBeNull()
  })

  it('returns IMO when matching event found', () => {
    const events = [makeEvent('VESSEL A', '9876543')]
    expect(findVesselImoFromEvents('VESSEL A', events)).toBe('9876543')
  })

  it('returns null when vessel name does not match', () => {
    const events = [makeEvent('VESSEL B', '9876543')]
    expect(findVesselImoFromEvents('VESSEL A', events)).toBeNull()
  })

  it('returns null when event has no IMO', () => {
    const events = [makeEvent('VESSEL A')]
    expect(findVesselImoFromEvents('VESSEL A', events)).toBeNull()
  })
})

// ─── getCurrentVessel ───────────────────────────────────────────────────────

describe('getCurrentVessel', () => {
  it('returns default with fallback when no route stops', () => {
    const result = getCurrentVessel([], null, { vesselName: 'FALLBACK', vesselImo: '1111111' })
    expect(result.status).toBe('not_departed')
    expect(result.vesselName).toBe('FALLBACK')
    expect(result.vesselImo).toBe('1111111')
    expect(result.isPlannedVessel).toBe(true)
  })

  it('returns default when route stops is null', () => {
    const result = getCurrentVessel(null, null)
    expect(result.status).toBe('not_departed')
    expect(result.vesselName).toBeNull()
  })

  it('returns delivered when destination has ATA', () => {
    const stops = [
      makeStop('Shanghai', 'origin', { vesselName: 'EVER GIVEN', vesselImo: '9811000', atd: '2026-01-01T00:00:00Z' }),
      makeStop('Rotterdam', 'destination', { ata: '2026-01-30T00:00:00Z' }),
    ]
    const result = getCurrentVessel(stops, null)
    expect(result.status).toBe('delivered')
    expect(result.vesselName).toBe('EVER GIVEN')
    expect(result.currentPort).toBe('Rotterdam')
    expect(result.isPlannedVessel).toBe(false)
  })

  it('returns in_transit when stop has ATD and next stop has no ATA', () => {
    const stops = [
      makeStop('Shanghai', 'origin', { vesselName: 'EVER GIVEN', vesselImo: '9811000', atd: '2026-01-10T00:00:00Z' }),
      makeStop('Singapore', 'transshipment', { eta: '2026-01-20T00:00:00Z' }),
      makeStop('Rotterdam', 'destination'),
    ]
    const result = getCurrentVessel(stops, null)
    expect(result.status).toBe('in_transit')
    expect(result.vesselName).toBe('EVER GIVEN')
    expect(result.vesselImo).toBe('9811000')
    expect(result.currentLeg).toEqual({ fromPort: 'Shanghai', toPort: 'Singapore' })
    expect(result.isPlannedVessel).toBe(false)
    expect(result.traceFrom).toBe('2026-01-10T00:00:00Z')
  })

  it('returns at_port when stop has ATA but no ATD', () => {
    const stops = [
      makeStop('Shanghai', 'origin', { vesselName: 'EVER GIVEN', atd: '2026-01-01T00:00:00Z' }),
      makeStop('Singapore', 'transshipment', { ata: '2026-01-10T00:00:00Z', vesselName: 'NEXT VESSEL', vesselImo: '5555555' }),
      makeStop('Rotterdam', 'destination'),
    ]
    const result = getCurrentVessel(stops, null)
    // Singapore has ATA but no ATD → at_port, next vessel is Rotterdam's stop
    expect(result.status).toBe('at_port')
    expect(result.currentPort).toBe('Singapore')
    expect(result.isPlannedVessel).toBe(true)
    // the next stop's vessel info
    expect(result.vesselName).toBeNull() // Rotterdam stop has no vessel
  })

  it('returns at_port with next stop vessel when available', () => {
    const stops = [
      makeStop('Shanghai', 'origin', { atd: '2026-01-01T00:00:00Z' }),
      makeStop('Singapore', 'transshipment', { ata: '2026-01-10T00:00:00Z' }),
      makeStop('Rotterdam', 'destination', { vesselName: 'MSC ANNA', vesselImo: '7777777' }),
    ]
    const result = getCurrentVessel(stops, null)
    expect(result.status).toBe('at_port')
    expect(result.vesselName).toBe('MSC ANNA')
    expect(result.vesselImo).toBe('7777777')
  })

  it('returns not_departed when no stops have ATD', () => {
    const stops = [
      makeStop('Shanghai', 'origin', { vesselName: 'EVER GIVEN', vesselImo: '9811000' }),
      makeStop('Rotterdam', 'destination'),
    ]
    const result = getCurrentVessel(stops, null)
    expect(result.status).toBe('not_departed')
    expect(result.vesselName).toBe('EVER GIVEN')
    expect(result.currentPort).toBe('Shanghai')
    expect(result.isPlannedVessel).toBe(true)
  })

  it('resolves vessel IMO from cargo events when stop lacks it', () => {
    const stops = [
      makeStop('Shanghai', 'origin', { vesselName: 'EVER GIVEN', atd: '2026-01-01T00:00:00Z' }),
      makeStop('Rotterdam', 'destination'),
    ]
    const events = [makeEvent('EVER GIVEN', '9811000')]
    const result = getCurrentVessel(stops, events)
    expect(result.vesselImo).toBe('9811000')
  })

  it('uses fallback vessel for not_departed when origin has no vessel', () => {
    const stops = [
      makeStop('Shanghai', 'origin'),
      makeStop('Rotterdam', 'destination'),
    ]
    const result = getCurrentVessel(stops, null, { vesselName: 'FB VESSEL', vesselImo: '1234567' })
    expect(result.vesselName).toBe('FB VESSEL')
    expect(result.vesselImo).toBe('1234567')
  })

  it('handles transshipment in_transit correctly', () => {
    const stops = [
      makeStop('Shanghai', 'origin', { vesselName: 'VESSEL 1', atd: '2026-01-01T00:00:00Z' }),
      makeStop('Singapore', 'transshipment', { ata: '2026-01-10T00:00:00Z', vesselName: 'VESSEL 2', vesselImo: '2222222', atd: '2026-01-12T00:00:00Z' }),
      makeStop('Rotterdam', 'destination'),
    ]
    const result = getCurrentVessel(stops, null)
    expect(result.status).toBe('in_transit')
    expect(result.vesselName).toBe('VESSEL 2')
    expect(result.vesselImo).toBe('2222222')
    expect(result.currentLeg).toEqual({ fromPort: 'Singapore', toPort: 'Rotterdam' })
  })
})

// ─── getVesselStatusDescription ─────────────────────────────────────────────

describe('getVesselStatusDescription', () => {
  it('returns in_transit key with destination', () => {
    const info: CurrentVesselInfo = {
      vesselName: 'EVER GIVEN',
      vesselImo: '9811000',
      status: 'in_transit',
      currentLeg: { fromPort: 'Shanghai', toPort: 'Rotterdam' },
      isPlannedVessel: false,
    }
    const desc = getVesselStatusDescription(info)
    expect(desc.key).toBe('fms_projects.map.inTransit')
    expect(desc.params?.destination).toBe('Rotterdam')
  })

  it('returns at_port key with vessel name', () => {
    const info: CurrentVesselInfo = {
      vesselName: 'MSC ANNA',
      vesselImo: null,
      status: 'at_port',
      currentPort: 'Singapore',
      isPlannedVessel: true,
    }
    const desc = getVesselStatusDescription(info)
    expect(desc.key).toBe('fms_projects.map.atPortAwaitingVessel')
    expect(desc.params?.port).toBe('Singapore')
    expect(desc.params?.vessel).toBe('MSC ANNA')
  })

  it('returns at_port key without vessel name', () => {
    const info: CurrentVesselInfo = {
      vesselName: null,
      vesselImo: null,
      status: 'at_port',
      currentPort: 'Singapore',
      isPlannedVessel: false,
    }
    const desc = getVesselStatusDescription(info)
    expect(desc.key).toBe('fms_projects.map.atPort')
  })

  it('returns awaiting departure key', () => {
    const info: CurrentVesselInfo = {
      vesselName: 'EVER GIVEN',
      vesselImo: '9811000',
      status: 'not_departed',
      isPlannedVessel: true,
    }
    const desc = getVesselStatusDescription(info)
    expect(desc.key).toBe('fms_projects.map.awaitingDeparture')
    expect(desc.params?.vessel).toBe('EVER GIVEN')
  })

  it('returns not departed key without vessel', () => {
    const info: CurrentVesselInfo = {
      vesselName: null,
      vesselImo: null,
      status: 'not_departed',
      isPlannedVessel: true,
    }
    const desc = getVesselStatusDescription(info)
    expect(desc.key).toBe('fms_projects.map.notDeparted')
  })

  it('returns delivered key', () => {
    const info: CurrentVesselInfo = {
      vesselName: 'EVER GIVEN',
      vesselImo: null,
      status: 'delivered',
      isPlannedVessel: false,
    }
    const desc = getVesselStatusDescription(info)
    expect(desc.key).toBe('fms_projects.map.delivered')
  })
})
