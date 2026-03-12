/**
 * Tests for tracking-integration.ts
 *
 * Tests pure functions: selectTrackingReference, canStartTracking
 * Note: startTrackingForProject requires database and service mocking,
 * better tested via integration tests.
 */

import { describe, it, expect } from 'vitest'
import { selectTrackingReference, canStartTracking } from '../tracking-integration'

describe('tracking-integration', () => {
  describe('selectTrackingReference', () => {
    it('should prefer booking number over BL and container', () => {
      const result = selectTrackingReference('BOOK123', 'BL456', ['CONT789'])
      expect(result).toEqual({
        referenceType: 'booking',
        referenceValue: 'BOOK123',
      })
    })

    it('should use BL number when no booking number', () => {
      const result = selectTrackingReference(null, 'BL456', ['CONT789'])
      expect(result).toEqual({
        referenceType: 'bol',
        referenceValue: 'BL456',
      })
    })

    it('should use first container when no booking or BL', () => {
      const result = selectTrackingReference(null, null, ['CONT789', 'CONT999'])
      expect(result).toEqual({
        referenceType: 'container',
        referenceValue: 'CONT789',
      })
    })

    it('should return null when no valid references', () => {
      const result = selectTrackingReference(null, null, [])
      expect(result).toBeNull()
    })

    it('should handle empty string booking number', () => {
      const result = selectTrackingReference('', 'BL456', [])
      expect(result).toEqual({
        referenceType: 'bol',
        referenceValue: 'BL456',
      })
    })

    it('should handle empty string BL number', () => {
      const result = selectTrackingReference(null, '', ['CONT789'])
      expect(result).toEqual({
        referenceType: 'container',
        referenceValue: 'CONT789',
      })
    })

    it('should handle empty container array', () => {
      const result = selectTrackingReference('BOOK123', null, [])
      expect(result).toEqual({
        referenceType: 'booking',
        referenceValue: 'BOOK123',
      })
    })
  })

  describe('canStartTracking', () => {
    it('should return true with carrier code and booking number', () => {
      expect(canStartTracking('MAEU', 'BOOK123', null, [])).toBe(true)
    })

    it('should return true with carrier code and BL number', () => {
      expect(canStartTracking('MAEU', null, 'BL456', [])).toBe(true)
    })

    it('should return true with carrier code and container numbers', () => {
      expect(canStartTracking('MAEU', null, null, ['CONT789'])).toBe(true)
    })

    it('should return true with carrier code and all references', () => {
      expect(canStartTracking('MAEU', 'BOOK123', 'BL456', ['CONT789'])).toBe(true)
    })

    it('should return false without carrier code', () => {
      expect(canStartTracking(null, 'BOOK123', 'BL456', ['CONT789'])).toBe(false)
    })

    it('should return false with empty carrier code', () => {
      expect(canStartTracking('', 'BOOK123', null, [])).toBe(false)
    })

    it('should return false with no references', () => {
      expect(canStartTracking('MAEU', null, null, [])).toBe(false)
    })

    it('should return false with empty strings as references', () => {
      expect(canStartTracking('MAEU', '', '', [])).toBe(false)
    })
  })
})
