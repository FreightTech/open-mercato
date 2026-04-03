import { describe, it, expect } from 'vitest'
import { mapIsoEquipmentCode, mergeTimestampsFromShipment } from '../tracking-sync'
import type { LegTimestampEntry } from '../../data/types'

// ─── mapIsoEquipmentCode ────────────────────────────────────────────────────

describe('mapIsoEquipmentCode', () => {
  it('returns null for null/undefined input', () => {
    expect(mapIsoEquipmentCode(null)).toBeNull()
    expect(mapIsoEquipmentCode(undefined)).toBeNull()
  })

  it('returns null for unknown code', () => {
    expect(mapIsoEquipmentCode('XXXX')).toBeNull()
    expect(mapIsoEquipmentCode('9999')).toBeNull()
  })

  it('maps 20ft General Purpose codes', () => {
    expect(mapIsoEquipmentCode('22G0')).toBe('20GP')
    expect(mapIsoEquipmentCode('22G1')).toBe('20GP')
    expect(mapIsoEquipmentCode('2200')).toBe('20GP')
    expect(mapIsoEquipmentCode('2210')).toBe('20GP')
  })

  it('maps 40ft General Purpose codes', () => {
    expect(mapIsoEquipmentCode('42G0')).toBe('40GP')
    expect(mapIsoEquipmentCode('42G1')).toBe('40GP')
  })

  it('maps 40ft High Cube codes', () => {
    expect(mapIsoEquipmentCode('45G0')).toBe('40HC')
    expect(mapIsoEquipmentCode('45G1')).toBe('40HC')
    expect(mapIsoEquipmentCode('4500')).toBe('40HC')
    expect(mapIsoEquipmentCode('4510')).toBe('40HC') // MSC variant
  })

  it('maps 45ft High Cube codes', () => {
    expect(mapIsoEquipmentCode('L5G0')).toBe('45HC')
    expect(mapIsoEquipmentCode('L5G1')).toBe('45HC')
  })

  it('maps 20ft Reefer codes', () => {
    expect(mapIsoEquipmentCode('22R0')).toBe('20RF')
    expect(mapIsoEquipmentCode('22R1')).toBe('20RF')
  })

  it('maps 40ft Reefer codes', () => {
    expect(mapIsoEquipmentCode('42R0')).toBe('40RF')
    expect(mapIsoEquipmentCode('42R1')).toBe('40RF')
  })

  it('maps 40ft High Cube Reefer codes', () => {
    expect(mapIsoEquipmentCode('45R0')).toBe('40RH')
    expect(mapIsoEquipmentCode('45R1')).toBe('40RH')
  })

  it('maps 20ft Open Top codes', () => {
    expect(mapIsoEquipmentCode('22U0')).toBe('20OT')
    expect(mapIsoEquipmentCode('22U1')).toBe('20OT')
  })

  it('maps 40ft Open Top codes', () => {
    expect(mapIsoEquipmentCode('42U0')).toBe('40OT')
  })

  it('maps 20ft Flat Rack codes', () => {
    expect(mapIsoEquipmentCode('22P1')).toBe('20FR')
    expect(mapIsoEquipmentCode('22P3')).toBe('20FR')
  })

  it('maps 40ft Flat Rack codes', () => {
    expect(mapIsoEquipmentCode('42P1')).toBe('40FR')
    expect(mapIsoEquipmentCode('42P3')).toBe('40FR')
  })

  it('is case-insensitive', () => {
    expect(mapIsoEquipmentCode('22g0')).toBe('20GP')
    expect(mapIsoEquipmentCode('45g1')).toBe('40HC')
    expect(mapIsoEquipmentCode('l5g0')).toBe('45HC')
  })
})

// ─── mergeTimestampsFromShipment ────────────────────────────────────────────

describe('mergeTimestampsFromShipment', () => {
  const manualEntry: LegTimestampEntry = {
    value: '2026-03-10T00:00:00Z',
    offset: null,
    source: 'manual',
    updatedAt: '2026-03-10T00:00:00Z',
  }

  const carrierEntry: LegTimestampEntry = {
    value: '2026-03-12T00:00:00Z',
    offset: '+08:00',
    source: 'carrier_api',
    updatedAt: '2026-03-12T00:00:00Z',
  }

  const portEntry: LegTimestampEntry = {
    value: '2026-03-11T00:00:00Z',
    offset: null,
    source: 'port',
    updatedAt: '2026-03-11T00:00:00Z',
  }

  const incomingEntry: LegTimestampEntry = {
    value: '2026-03-15T00:00:00Z',
    offset: '+08:00',
    source: 'carrier_api',
    updatedAt: '2026-03-15T00:00:00Z',
  }

  it('returns null when both existing and incoming are null', () => {
    expect(mergeTimestampsFromShipment(null, null)).toBeNull()
  })

  it('returns null when both existing and incoming are empty', () => {
    expect(mergeTimestampsFromShipment([], [])).toBeNull()
  })

  it('returns incoming entries when existing is null', () => {
    const result = mergeTimestampsFromShipment(null, [incomingEntry])
    expect(result).toHaveLength(1)
    expect(result![0].value).toBe('2026-03-15T00:00:00Z')
  })

  it('preserves manual entries and replaces carrier_api entries', () => {
    const existing = [manualEntry, carrierEntry]
    const incoming = [incomingEntry]

    const result = mergeTimestampsFromShipment(existing, incoming)
    expect(result).toHaveLength(2)
    // incoming (carrier_api) comes first, then preserved manual
    expect(result![0].source).toBe('carrier_api')
    expect(result![0].value).toBe('2026-03-15T00:00:00Z') // new carrier data
    expect(result![1].source).toBe('manual')
    expect(result![1].value).toBe('2026-03-10T00:00:00Z') // preserved
  })

  it('preserves non-carrier_api entries (port, edi, etc.)', () => {
    const existing = [portEntry, carrierEntry]
    const incoming = [incomingEntry]

    const result = mergeTimestampsFromShipment(existing, incoming)
    expect(result).toHaveLength(2)
    // incoming replaces old carrier; port is preserved
    const sources = result!.map((e) => e.source)
    expect(sources).toContain('carrier_api')
    expect(sources).toContain('port')
  })

  it('handles existing with only manual entries and no incoming', () => {
    const result = mergeTimestampsFromShipment([manualEntry], [])
    expect(result).toHaveLength(1)
    expect(result![0].source).toBe('manual')
  })

  it('replaces all carrier_api entries with incoming batch', () => {
    const existing = [carrierEntry, { ...carrierEntry, value: '2026-03-13T00:00:00Z' }]
    const incoming = [incomingEntry]

    const result = mergeTimestampsFromShipment(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result![0].value).toBe('2026-03-15T00:00:00Z')
  })
})
