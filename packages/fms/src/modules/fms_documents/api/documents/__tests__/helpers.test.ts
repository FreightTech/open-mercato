import { describe, it, expect } from 'vitest'
import { buildSearchFilters, FIELD_MAP } from '../helpers'

describe('buildSearchFilters', () => {
  describe('deletedAt filter', () => {
    it('should exclude deleted records by default', () => {
      const result = buildSearchFilters({})
      expect(result.deletedAt).toBeNull()
    })

    it('should include deleted records when includeDeleted is true', () => {
      const result = buildSearchFilters({ includeDeleted: true })
      expect(result.deletedAt).toBeUndefined()
    })

    it('should exclude deleted records when includeDeleted is false', () => {
      const result = buildSearchFilters({ includeDeleted: false })
      expect(result.deletedAt).toBeNull()
    })
  })

  describe('category filter', () => {
    it('should add category filter when provided', () => {
      const result = buildSearchFilters({ category: 'invoice' })
      expect(result.category).toBe('invoice')
    })

    it('should not add category filter when not provided', () => {
      const result = buildSearchFilters({})
      expect(result.category).toBeUndefined()
    })

    it('should handle different category values', () => {
      const categories = ['invoice', 'bol', 'booking_confirmation', 'packing_list', 'other']
      for (const category of categories) {
        const result = buildSearchFilters({ category })
        expect(result.category).toBe(category)
      }
    })
  })

  describe('relatedEntityId filter', () => {
    it('should add relatedEntityId filter when provided', () => {
      const result = buildSearchFilters({ relatedEntityId: 'entity-123' })
      expect(result.relatedEntityId).toBe('entity-123')
    })

    it('should not add filter when not provided', () => {
      const result = buildSearchFilters({})
      expect(result.relatedEntityId).toBeUndefined()
    })
  })

  describe('relatedEntityType filter', () => {
    it('should add relatedEntityType filter when provided', () => {
      const result = buildSearchFilters({ relatedEntityType: 'shipment' })
      expect(result.relatedEntityType).toBe('shipment')
    })

    it('should not add filter when not provided', () => {
      const result = buildSearchFilters({})
      expect(result.relatedEntityType).toBeUndefined()
    })
  })

  describe('search filter', () => {
    it('should create $or filter with multiple search fields', () => {
      const result = buildSearchFilters({ search: 'test' })
      expect(result.$or).toBeDefined()
      expect(Array.isArray(result.$or)).toBe(true)
    })

    it('should search across name, description, documentNumber, blNumber, bookingNumber, vesselName, sellerName, buyerName', () => {
      const result = buildSearchFilters({ search: 'test' })
      const orFilters = result.$or as Array<Record<string, unknown>>

      const searchedFields = orFilters.map((f) => Object.keys(f)[0])
      expect(searchedFields).toContain('name')
      expect(searchedFields).toContain('description')
      expect(searchedFields).toContain('documentNumber')
      expect(searchedFields).toContain('blNumber')
      expect(searchedFields).toContain('bookingNumber')
      expect(searchedFields).toContain('vesselName')
      expect(searchedFields).toContain('sellerName')
      expect(searchedFields).toContain('buyerName')
    })

    it('should wrap search term with wildcards for $ilike', () => {
      const result = buildSearchFilters({ search: 'invoice' })
      const orFilters = result.$or as Array<Record<string, { $ilike: string }>>

      for (const filter of orFilters) {
        const value = Object.values(filter)[0]
        expect(value.$ilike).toBe('%invoice%')
      }
    })

    it('should trim whitespace from search term', () => {
      const result = buildSearchFilters({ search: '  test  ' })
      const orFilters = result.$or as Array<Record<string, { $ilike: string }>>

      const firstFilter = Object.values(orFilters[0])[0]
      expect(firstFilter.$ilike).toBe('%test%')
    })

    it('should not add search filter for empty string', () => {
      const result = buildSearchFilters({ search: '' })
      expect(result.$or).toBeUndefined()
    })

    it('should not add search filter for whitespace-only string', () => {
      const result = buildSearchFilters({ search: '   ' })
      expect(result.$or).toBeUndefined()
    })

    it('should not add search filter when search is not provided', () => {
      const result = buildSearchFilters({})
      expect(result.$or).toBeUndefined()
    })

    it('should escape special SQL LIKE characters in search term', () => {
      const result = buildSearchFilters({ search: 'test%value' })
      const orFilters = result.$or as Array<Record<string, { $ilike: string }>>

      const firstFilter = Object.values(orFilters[0])[0]
      expect(firstFilter.$ilike).toContain('test')
      expect(firstFilter.$ilike).toContain('value')
    })
  })

  describe('combined filters', () => {
    it('should combine multiple filters', () => {
      const result = buildSearchFilters({
        category: 'invoice',
        relatedEntityId: 'entity-123',
        relatedEntityType: 'shipment',
        search: 'test',
      })

      expect(result.deletedAt).toBeNull()
      expect(result.category).toBe('invoice')
      expect(result.relatedEntityId).toBe('entity-123')
      expect(result.relatedEntityType).toBe('shipment')
      expect(result.$or).toBeDefined()
    })

    it('should handle all optional filters being empty', () => {
      const result = buildSearchFilters({})
      expect(result).toEqual({ deletedAt: null })
    })

    it('should handle pagination params without adding filters for them', () => {
      const result = buildSearchFilters({
        page: 2,
        limit: 50,
        sortField: 'name',
        sortDir: 'asc',
      })

      expect(result.page).toBeUndefined()
      expect(result.limit).toBeUndefined()
      expect(result.sortField).toBeUndefined()
      expect(result.sortDir).toBeUndefined()
    })
  })
})

describe('FIELD_MAP', () => {
  it('should have all expected document fields', () => {
    const expectedFields = [
      'id',
      'organizationId',
      'tenantId',
      'name',
      'category',
      'description',
      'attachmentId',
      'relatedEntityId',
      'relatedEntityType',
      'documentType',
      'documentNumber',
      'blNumber',
      'mblNumber',
      'bookingNumber',
      'vesselName',
      'voyageNumber',
      'portOfLoading',
      'portOfDischarge',
      'sellerName',
      'buyerName',
      'totalGrossAmount',
      'currency',
      'processedAt',
      'createdAt',
      'createdBy',
      'updatedAt',
      'updatedBy',
      'deletedAt',
    ]

    expect(Object.keys(FIELD_MAP).sort()).toEqual(expectedFields.sort())
  })

  it('should map frontend field names to correct database field names', () => {
    expect(FIELD_MAP.organizationId).toBe('organizationId')
    expect(FIELD_MAP.documentNumber).toBe('documentNumber')
    expect(FIELD_MAP.blNumber).toBe('blNumber')
    expect(FIELD_MAP.createdAt).toBe('createdAt')
  })
})
