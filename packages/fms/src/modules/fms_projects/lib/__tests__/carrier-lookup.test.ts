import { describe, it, expect } from 'vitest'
import { escapeLikePattern } from '../carrier-lookup'

describe('escapeLikePattern', () => {
  it('should escape percent sign', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%')
    expect(escapeLikePattern('%discount%')).toBe('\\%discount\\%')
  })

  it('should escape underscore', () => {
    expect(escapeLikePattern('test_value')).toBe('test\\_value')
    expect(escapeLikePattern('__init__')).toBe('\\_\\_init\\_\\_')
  })

  it('should escape both percent and underscore', () => {
    expect(escapeLikePattern('test_100%')).toBe('test\\_100\\%')
    expect(escapeLikePattern('%_mixed_%')).toBe('\\%\\_mixed\\_\\%')
  })

  it('should handle empty string', () => {
    expect(escapeLikePattern('')).toBe('')
  })

  it('should handle string without special characters', () => {
    expect(escapeLikePattern('Maersk Line')).toBe('Maersk Line')
    expect(escapeLikePattern('CMA CGM')).toBe('CMA CGM')
    expect(escapeLikePattern('MSC')).toBe('MSC')
  })

  it('should handle string with numbers', () => {
    expect(escapeLikePattern('Carrier123')).toBe('Carrier123')
  })

  it('should preserve other special characters', () => {
    expect(escapeLikePattern('Carrier (USA)')).toBe('Carrier (USA)')
    expect(escapeLikePattern('Carrier-Name')).toBe('Carrier-Name')
    expect(escapeLikePattern("Carrier's Name")).toBe("Carrier's Name")
  })

  it('should handle multiple consecutive wildcards', () => {
    expect(escapeLikePattern('%%')).toBe('\\%\\%')
    expect(escapeLikePattern('__')).toBe('\\_\\_')
    expect(escapeLikePattern('%_%')).toBe('\\%\\_\\%')
  })
})

// Note: lookupCarrierByName tests would require mocking the EntityManager
// and database. These are better suited for integration tests with a real
// or ephemeral database. The function's behavior depends on:
// - detectCarrierCodeFromName (from carrier-scac-mapper.ts)
// - Database queries with em.findOne
// - The FmsCarrier entity structure
//
// For now, we test the pure utility function escapeLikePattern.
