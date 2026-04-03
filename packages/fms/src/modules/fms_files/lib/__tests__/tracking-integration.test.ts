import { describe, it, expect } from 'vitest'
import { shouldTriggerTracking } from '../tracking-integration'

/**
 * shouldTriggerTracking requires: SHIP type, carrierId present, bookingNumber OR blNumber.
 * We pass minimal FmsFileLeg-shaped objects.
 */
function makeLeg(opts: {
  type?: string
  carrierId?: string | null
  bookingNumber?: string | null
  blNumber?: string | null
}) {
  return {
    type: opts.type ?? 'SHIP',
    carrierId: opts.carrierId ?? null,
    bookingNumber: opts.bookingNumber ?? null,
    blNumber: opts.blNumber ?? null,
  } as any
}

describe('shouldTriggerTracking', () => {
  it('returns true for SHIP leg with carrierId and bookingNumber', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'SHIP',
      carrierId: 'carrier-1',
      bookingNumber: 'BK001',
    }))).toBe(true)
  })

  it('returns true for SHIP leg with carrierId and blNumber', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'SHIP',
      carrierId: 'carrier-1',
      blNumber: 'BL001',
    }))).toBe(true)
  })

  it('returns true when both bookingNumber and blNumber are present', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'SHIP',
      carrierId: 'carrier-1',
      bookingNumber: 'BK001',
      blNumber: 'BL001',
    }))).toBe(true)
  })

  it('returns false for TRUCK leg', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'TRUCK',
      carrierId: 'carrier-1',
      bookingNumber: 'BK001',
    }))).toBe(false)
  })

  it('returns false for RAIL leg', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'RAIL',
      carrierId: 'carrier-1',
      bookingNumber: 'BK001',
    }))).toBe(false)
  })

  it('returns false for AIR leg', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'AIR',
      carrierId: 'carrier-1',
      bookingNumber: 'BK001',
    }))).toBe(false)
  })

  it('returns false when carrierId is missing', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'SHIP',
      carrierId: null,
      bookingNumber: 'BK001',
    }))).toBe(false)
  })

  it('returns false when neither bookingNumber nor blNumber is present', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'SHIP',
      carrierId: 'carrier-1',
      bookingNumber: null,
      blNumber: null,
    }))).toBe(false)
  })

  it('returns false when bookingNumber is empty string', () => {
    expect(shouldTriggerTracking(makeLeg({
      type: 'SHIP',
      carrierId: 'carrier-1',
      bookingNumber: '',
      blNumber: '',
    }))).toBe(false)
  })
})
