import { describe, it, expect } from 'vitest'
import { parseFilterRow, buildSearchFilters, FIELD_MAP, type FilterRow } from '../helpers'

describe('parseFilterRow', () => {
  describe('field mapping', () => {
    it('should return null for unknown fields', () => {
      const row: FilterRow = { field: 'unknownField', operator: 'equals', values: ['test'] }
      expect(parseFilterRow(row)).toBeNull()
    })

    it('should map camelCase fields to database field names', () => {
      const row: FilterRow = { field: 'documentNumber', operator: 'equals', values: ['INV-001'] }
      const result = parseFilterRow(row)
      expect(result).toEqual({ documentNumber: { $eq: 'INV-001' } })
    })

    it('should handle all fields in FIELD_MAP', () => {
      const expectedFields = [
        'id', 'organizationId', 'tenantId', 'name', 'category', 'description',
        'attachmentId', 'relatedEntityId', 'relatedEntityType', 'documentType',
        'documentNumber', 'blNumber', 'mblNumber', 'bookingNumber', 'vesselName',
        'voyageNumber', 'portOfLoading', 'portOfDischarge', 'sellerName', 'buyerName',
        'totalGrossAmount', 'currency', 'processedAt', 'createdAt', 'createdBy',
        'updatedAt', 'updatedBy', 'deletedAt',
      ]

      for (const field of expectedFields) {
        expect(FIELD_MAP[field]).toBeDefined()
      }
    })
  })

  describe('is_any_of operator', () => {
    it('should return $in filter for multiple values', () => {
      const row: FilterRow = { field: 'category', operator: 'is_any_of', values: ['invoice', 'bol'] }
      expect(parseFilterRow(row)).toEqual({ category: { $in: ['invoice', 'bol'] } })
    })

    it('should return $in filter for single value', () => {
      const row: FilterRow = { field: 'category', operator: 'is_any_of', values: ['invoice'] }
      expect(parseFilterRow(row)).toEqual({ category: { $in: ['invoice'] } })
    })

    it('should return null for empty values array', () => {
      const row: FilterRow = { field: 'category', operator: 'is_any_of', values: [] }
      expect(parseFilterRow(row)).toBeNull()
    })
  })

  describe('is_not_any_of operator', () => {
    it('should return $nin filter for multiple values', () => {
      const row: FilterRow = { field: 'category', operator: 'is_not_any_of', values: ['invoice', 'bol'] }
      expect(parseFilterRow(row)).toEqual({ category: { $nin: ['invoice', 'bol'] } })
    })

    it('should return null for empty values array', () => {
      const row: FilterRow = { field: 'category', operator: 'is_not_any_of', values: [] }
      expect(parseFilterRow(row)).toBeNull()
    })
  })

  describe('contains operator', () => {
    it('should return $ilike filter with wildcards', () => {
      const row: FilterRow = { field: 'name', operator: 'contains', values: ['invoice'] }
      expect(parseFilterRow(row)).toEqual({ name: { $ilike: '%invoice%' } })
    })

    it('should return null for empty string value', () => {
      const row: FilterRow = { field: 'name', operator: 'contains', values: [''] }
      expect(parseFilterRow(row)).toBeNull()
    })

    it('should return null for undefined value', () => {
      const row: FilterRow = { field: 'name', operator: 'contains', values: [undefined] }
      expect(parseFilterRow(row)).toBeNull()
    })

    it('should return null for null value', () => {
      const row: FilterRow = { field: 'name', operator: 'contains', values: [null] }
      expect(parseFilterRow(row)).toBeNull()
    })

    it('should handle special characters in search term', () => {
      const row: FilterRow = { field: 'name', operator: 'contains', values: ['test%value'] }
      expect(parseFilterRow(row)).toEqual({ name: { $ilike: '%test%value%' } })
    })
  })

  describe('is_empty operator', () => {
    it('should return $eq null filter regardless of values', () => {
      const row: FilterRow = { field: 'description', operator: 'is_empty', values: [] }
      expect(parseFilterRow(row)).toEqual({ description: { $eq: null } })
    })

    it('should ignore provided values', () => {
      const row: FilterRow = { field: 'description', operator: 'is_empty', values: ['ignored'] }
      expect(parseFilterRow(row)).toEqual({ description: { $eq: null } })
    })
  })

  describe('is_not_empty operator', () => {
    it('should return $ne null filter regardless of values', () => {
      const row: FilterRow = { field: 'description', operator: 'is_not_empty', values: [] }
      expect(parseFilterRow(row)).toEqual({ description: { $ne: null } })
    })
  })

  describe('equals operator', () => {
    it('should return $eq filter for string value', () => {
      const row: FilterRow = { field: 'documentNumber', operator: 'equals', values: ['INV-001'] }
      expect(parseFilterRow(row)).toEqual({ documentNumber: { $eq: 'INV-001' } })
    })

    it('should return $eq filter for numeric value', () => {
      const row: FilterRow = { field: 'totalGrossAmount', operator: 'equals', values: [1000] }
      expect(parseFilterRow(row)).toEqual({ totalGrossAmount: { $eq: 1000 } })
    })

    it('should return null for empty string', () => {
      const row: FilterRow = { field: 'documentNumber', operator: 'equals', values: [''] }
      expect(parseFilterRow(row)).toBeNull()
    })

    it('should return null for undefined', () => {
      const row: FilterRow = { field: 'documentNumber', operator: 'equals', values: [undefined] }
      expect(parseFilterRow(row)).toBeNull()
    })

    it('should return null for null', () => {
      const row: FilterRow = { field: 'documentNumber', operator: 'equals', values: [null] }
      expect(parseFilterRow(row)).toBeNull()
    })
  })

  describe('not_equals operator', () => {
    it('should return $ne filter for string value', () => {
      const row: FilterRow = { field: 'category', operator: 'not_equals', values: ['invoice'] }
      expect(parseFilterRow(row)).toEqual({ category: { $ne: 'invoice' } })
    })

    it('should return null for empty value', () => {
      const row: FilterRow = { field: 'category', operator: 'not_equals', values: [''] }
      expect(parseFilterRow(row)).toBeNull()
    })
  })

  describe('is_true operator', () => {
    it('should return $eq true filter regardless of values', () => {
      const row: FilterRow = { field: 'name', operator: 'is_true', values: [] }
      expect(parseFilterRow(row)).toEqual({ name: { $eq: true } })
    })
  })

  describe('is_false operator', () => {
    it('should return $eq false filter regardless of values', () => {
      const row: FilterRow = { field: 'name', operator: 'is_false', values: [] }
      expect(parseFilterRow(row)).toEqual({ name: { $eq: false } })
    })
  })

  describe('greater_than operator', () => {
    it('should return $gt filter for numeric value', () => {
      const row: FilterRow = { field: 'totalGrossAmount', operator: 'greater_than', values: [1000] }
      expect(parseFilterRow(row)).toEqual({ totalGrossAmount: { $gt: 1000 } })
    })

    it('should return $gt filter for date string', () => {
      const row: FilterRow = { field: 'createdAt', operator: 'greater_than', values: ['2024-01-01'] }
      expect(parseFilterRow(row)).toEqual({ createdAt: { $gt: '2024-01-01' } })
    })

    it('should return null for empty value', () => {
      const row: FilterRow = { field: 'totalGrossAmount', operator: 'greater_than', values: [''] }
      expect(parseFilterRow(row)).toBeNull()
    })
  })

  describe('less_than operator', () => {
    it('should return $lt filter for numeric value', () => {
      const row: FilterRow = { field: 'totalGrossAmount', operator: 'less_than', values: [5000] }
      expect(parseFilterRow(row)).toEqual({ totalGrossAmount: { $lt: 5000 } })
    })

    it('should return null for empty value', () => {
      const row: FilterRow = { field: 'totalGrossAmount', operator: 'less_than', values: [null] }
      expect(parseFilterRow(row)).toBeNull()
    })
  })

  describe('unknown operator', () => {
    it('should return null for unknown operators', () => {
      const row: FilterRow = { field: 'name', operator: 'starts_with', values: ['test'] }
      expect(parseFilterRow(row)).toBeNull()
    })

    it('should return null for empty operator', () => {
      const row: FilterRow = { field: 'name', operator: '', values: ['test'] }
      expect(parseFilterRow(row)).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('should handle zero as a valid value', () => {
      const row: FilterRow = { field: 'totalGrossAmount', operator: 'equals', values: [0] }
      expect(parseFilterRow(row)).toEqual({ totalGrossAmount: { $eq: 0 } })
    })

    it('should handle false as a valid value for equals', () => {
      const row: FilterRow = { field: 'name', operator: 'equals', values: [false] }
      expect(parseFilterRow(row)).toEqual({ name: { $eq: false } })
    })

    it('should use only the first value from the values array', () => {
      const row: FilterRow = { field: 'name', operator: 'equals', values: ['first', 'second', 'third'] }
      expect(parseFilterRow(row)).toEqual({ name: { $eq: 'first' } })
    })
  })
})

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
