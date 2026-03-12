/**
 * Tests for project-creation.service.ts
 *
 * Tests pure functions: isDuplicateKeyError
 * Note: generateSimplifiedProjectNumber and createProjectFromBookingData
 * require database access and are better tested via integration tests.
 */

import { describe, it, expect } from 'vitest'
import { isDuplicateKeyError, MAX_PROJECT_CREATION_RETRIES } from '../project-creation.service'

describe('project-creation.service', () => {
  describe('isDuplicateKeyError', () => {
    it('should detect "duplicate key" error message', () => {
      const error = new Error('duplicate key value violates unique constraint')
      expect(isDuplicateKeyError(error)).toBe(true)
    })

    it('should detect "unique constraint" error message', () => {
      const error = new Error('unique constraint violation on fms_projects_number_unique')
      expect(isDuplicateKeyError(error)).toBe(true)
    })

    it('should detect "violates unique" error message', () => {
      const error = new Error('violates unique constraint "fms_projects_number_unique"')
      expect(isDuplicateKeyError(error)).toBe(true)
    })

    it('should detect PostgreSQL error code 23505', () => {
      const error = { code: '23505', message: 'Some error' }
      expect(isDuplicateKeyError(error)).toBe(true)
    })

    it('should return false for non-duplicate errors', () => {
      const error = new Error('Connection refused')
      expect(isDuplicateKeyError(error)).toBe(false)
    })

    it('should return false for null/undefined', () => {
      expect(isDuplicateKeyError(null)).toBe(false)
      expect(isDuplicateKeyError(undefined)).toBe(false)
    })

    it('should handle string errors', () => {
      expect(isDuplicateKeyError('duplicate key violation')).toBe(true)
      expect(isDuplicateKeyError('random error')).toBe(false)
    })

    it('should return false for unrelated error codes', () => {
      const error = { code: '42P01', message: 'Table not found' }
      expect(isDuplicateKeyError(error)).toBe(false)
    })
  })

  describe('MAX_PROJECT_CREATION_RETRIES', () => {
    it('should be set to 3', () => {
      expect(MAX_PROJECT_CREATION_RETRIES).toBe(3)
    })
  })
})
