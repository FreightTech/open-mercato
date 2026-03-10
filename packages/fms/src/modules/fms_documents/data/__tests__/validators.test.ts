import { describe, it, expect } from 'vitest'
import {
  documentCategorySchema,
  createDocumentSchema,
  updateDocumentSchema,
  documentFilterSchema,
  documentListQuerySchema,
  uploadDocumentSchema,
} from '../validators'

describe('documentCategorySchema', () => {
  const validCategories = [
    'offer',
    'invoice',
    'customs_declaration',
    'bill_of_lading',
    'booking_confirmation',
    'delivery_note',
    'packing_list',
    'vgm_certificate',
    'other',
  ]

  it.each(validCategories)('should accept valid category: %s', (category) => {
    const result = documentCategorySchema.safeParse(category)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(category)
    }
  })

  it('should reject invalid category', () => {
    const result = documentCategorySchema.safeParse('invalid_category')
    expect(result.success).toBe(false)
  })

  it('should reject empty string', () => {
    const result = documentCategorySchema.safeParse('')
    expect(result.success).toBe(false)
  })

  it('should reject null', () => {
    const result = documentCategorySchema.safeParse(null)
    expect(result.success).toBe(false)
  })

  it('should reject undefined', () => {
    const result = documentCategorySchema.safeParse(undefined)
    expect(result.success).toBe(false)
  })
})

describe('createDocumentSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  it('should accept valid document with all required fields', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'Test Document',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Test Document')
      expect(result.data.category).toBe('other') // default
    }
  })

  it('should accept valid document with all fields', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'Test Document',
      category: 'invoice',
      description: 'A test invoice document',
      relatedEntityId: validUuid,
      relatedEntityType: 'sales_order',
      createdBy: validUuid,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('invoice')
      expect(result.data.description).toBe('A test invoice document')
    }
  })

  it('should reject missing organizationId', () => {
    const result = createDocumentSchema.safeParse({
      tenantId: validUuid,
      name: 'Test Document',
    })
    expect(result.success).toBe(false)
  })

  it('should reject missing tenantId', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      name: 'Test Document',
    })
    expect(result.success).toBe(false)
  })

  it('should reject missing name', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty name', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('should reject name longer than 255 characters', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'A'.repeat(256),
    })
    expect(result.success).toBe(false)
  })

  it('should accept name with exactly 255 characters', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'A'.repeat(255),
    })
    expect(result.success).toBe(true)
  })

  it('should default empty category to "other"', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'Test Document',
      category: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('other')
    }
  })

  it('should default null category to "other"', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'Test Document',
      category: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('other')
    }
  })

  it('should convert empty description to null', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'Test Document',
      description: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeNull()
    }
  })

  it('should reject description longer than 1000 characters', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'Test Document',
      description: 'A'.repeat(1001),
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid organizationId UUID', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: 'not-a-uuid',
      tenantId: validUuid,
      name: 'Test Document',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid relatedEntityId UUID', () => {
    const result = createDocumentSchema.safeParse({
      organizationId: validUuid,
      tenantId: validUuid,
      name: 'Test Document',
      relatedEntityId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateDocumentSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  it('should accept partial update with only name', () => {
    const result = updateDocumentSchema.safeParse({
      name: 'Updated Name',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Updated Name')
    }
  })

  it('should accept partial update with only category', () => {
    const result = updateDocumentSchema.safeParse({
      category: 'invoice',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('invoice')
    }
  })

  it('should accept empty object (no updates)', () => {
    const result = updateDocumentSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should accept updatedBy field', () => {
    const result = updateDocumentSchema.safeParse({
      name: 'Updated Name',
      updatedBy: validUuid,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updatedBy).toBe(validUuid)
    }
  })

  it('should not allow organizationId in update', () => {
    const result = updateDocumentSchema.safeParse({
      organizationId: validUuid,
      name: 'Updated Name',
    })
    // The schema strips organizationId
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('organizationId')
    }
  })

  it('should not allow tenantId in update', () => {
    const result = updateDocumentSchema.safeParse({
      tenantId: validUuid,
      name: 'Updated Name',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('tenantId')
    }
  })

  it('should not allow createdBy in update', () => {
    const result = updateDocumentSchema.safeParse({
      createdBy: validUuid,
      name: 'Updated Name',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('createdBy')
    }
  })
})

describe('documentFilterSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  it('should accept empty filter', () => {
    const result = documentFilterSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should accept category filter', () => {
    const result = documentFilterSchema.safeParse({
      category: 'invoice',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('invoice')
    }
  })

  it('should accept search filter', () => {
    const result = documentFilterSchema.safeParse({
      search: 'test query',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.search).toBe('test query')
    }
  })

  it('should accept relatedEntityId filter', () => {
    const result = documentFilterSchema.safeParse({
      relatedEntityId: validUuid,
    })
    expect(result.success).toBe(true)
  })

  it('should accept relatedEntityType filter', () => {
    const result = documentFilterSchema.safeParse({
      relatedEntityType: 'sales_order',
    })
    expect(result.success).toBe(true)
  })

  it('should accept includeDeleted filter', () => {
    const result = documentFilterSchema.safeParse({
      includeDeleted: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.includeDeleted).toBe(true)
    }
  })

  it('should coerce includeDeleted from string', () => {
    const result = documentFilterSchema.safeParse({
      includeDeleted: 'true',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.includeDeleted).toBe(true)
    }
  })

  it('should reject invalid category in filter', () => {
    const result = documentFilterSchema.safeParse({
      category: 'invalid_category',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid relatedEntityId UUID', () => {
    const result = documentFilterSchema.safeParse({
      relatedEntityId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('should accept combined filters', () => {
    const result = documentFilterSchema.safeParse({
      category: 'invoice',
      search: 'test',
      relatedEntityId: validUuid,
      relatedEntityType: 'sales_order',
      includeDeleted: false,
    })
    expect(result.success).toBe(true)
  })
})

describe('documentListQuerySchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  it('should accept empty query with defaults', () => {
    const result = documentListQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(50)
      expect(result.data.sortField).toBe('createdAt')
      expect(result.data.sortDir).toBe('desc')
      expect(result.data.includeDeleted).toBe(false)
    }
  })

  it('should accept custom page number', () => {
    const result = documentListQuerySchema.safeParse({ page: 5 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(5)
    }
  })

  it('should coerce page from string', () => {
    const result = documentListQuerySchema.safeParse({ page: '3' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
    }
  })

  it('should reject page less than 1', () => {
    const result = documentListQuerySchema.safeParse({ page: 0 })
    expect(result.success).toBe(false)
  })

  it('should reject negative page', () => {
    const result = documentListQuerySchema.safeParse({ page: -1 })
    expect(result.success).toBe(false)
  })

  it('should accept custom limit', () => {
    const result = documentListQuerySchema.safeParse({ limit: 100 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(100)
    }
  })

  it('should coerce limit from string', () => {
    const result = documentListQuerySchema.safeParse({ limit: '25' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(25)
    }
  })

  it('should reject limit less than 1', () => {
    const result = documentListQuerySchema.safeParse({ limit: 0 })
    expect(result.success).toBe(false)
  })

  it('should reject limit greater than 100', () => {
    const result = documentListQuerySchema.safeParse({ limit: 101 })
    expect(result.success).toBe(false)
  })

  it('should accept limit of exactly 100', () => {
    const result = documentListQuerySchema.safeParse({ limit: 100 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(100)
    }
  })

  it('should accept sortDir "asc"', () => {
    const result = documentListQuerySchema.safeParse({ sortDir: 'asc' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sortDir).toBe('asc')
    }
  })

  it('should accept sortDir "desc"', () => {
    const result = documentListQuerySchema.safeParse({ sortDir: 'desc' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sortDir).toBe('desc')
    }
  })

  it('should reject invalid sortDir', () => {
    const result = documentListQuerySchema.safeParse({ sortDir: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('should accept valid sortField', () => {
    const validFields = [
      'name', 'category', 'documentType', 'documentNumber',
      'blNumber', 'bookingNumber', 'vesselName', 'sellerName',
      'buyerName', 'totalGrossAmount', 'currency', 'processedAt',
      'createdAt', 'updatedAt',
    ]
    for (const field of validFields) {
      const result = documentListQuerySchema.safeParse({ sortField: field })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.sortField).toBe(field)
      }
    }
  })

  it('should reject invalid sortField', () => {
    const result = documentListQuerySchema.safeParse({ sortField: 'password' })
    expect(result.success).toBe(false)
  })

  it('should reject arbitrary string as sortField', () => {
    const result = documentListQuerySchema.safeParse({ sortField: 'DROP TABLE documents' })
    expect(result.success).toBe(false)
  })

  it('should accept category filter', () => {
    const result = documentListQuerySchema.safeParse({ category: 'invoice' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('invoice')
    }
  })

  it('should reject invalid category', () => {
    const result = documentListQuerySchema.safeParse({ category: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('should accept search query', () => {
    const result = documentListQuerySchema.safeParse({ search: 'test query' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.search).toBe('test query')
    }
  })

  it('should accept relatedEntityId', () => {
    const result = documentListQuerySchema.safeParse({ relatedEntityId: validUuid })
    expect(result.success).toBe(true)
  })

  it('should accept relatedEntityType', () => {
    const result = documentListQuerySchema.safeParse({ relatedEntityType: 'sales_order' })
    expect(result.success).toBe(true)
  })

  it('should accept all query parameters combined', () => {
    const result = documentListQuerySchema.safeParse({
      page: 2,
      limit: 25,
      sortField: 'name',
      sortDir: 'asc',
      category: 'invoice',
      search: 'test',
      relatedEntityId: validUuid,
      relatedEntityType: 'sales_order',
      includeDeleted: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(2)
      expect(result.data.limit).toBe(25)
      expect(result.data.sortField).toBe('name')
      expect(result.data.sortDir).toBe('asc')
      expect(result.data.category).toBe('invoice')
      expect(result.data.search).toBe('test')
      expect(result.data.relatedEntityId).toBe(validUuid)
      expect(result.data.relatedEntityType).toBe('sales_order')
      expect(result.data.includeDeleted).toBe(true)
    }
  })
})

describe('uploadDocumentSchema', () => {
  it('should accept valid upload with required fields', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'test-file.pdf',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('test-file.pdf')
      expect(result.data.category).toBe('other') // default
    }
  })

  it('should accept valid upload with all fields', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000'
    const result = uploadDocumentSchema.safeParse({
      name: 'invoice-2024.pdf',
      category: 'invoice',
      description: 'Monthly invoice',
      relatedEntityId: validUuid,
      relatedEntityType: 'sales_order',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('invoice-2024.pdf')
      expect(result.data.category).toBe('invoice')
      expect(result.data.description).toBe('Monthly invoice')
    }
  })

  it('should reject missing name', () => {
    const result = uploadDocumentSchema.safeParse({
      category: 'invoice',
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty name', () => {
    const result = uploadDocumentSchema.safeParse({
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('should reject name longer than 255 characters', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'A'.repeat(256),
    })
    expect(result.success).toBe(false)
  })

  it('should default empty category to "other"', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'test.pdf',
      category: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('other')
    }
  })

  it('should default null category to "other"', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'test.pdf',
      category: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('other')
    }
  })

  it('should convert empty description to null', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'test.pdf',
      description: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeNull()
    }
  })

  it('should reject description longer than 1000 characters', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'test.pdf',
      description: 'A'.repeat(1001),
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid category', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'test.pdf',
      category: 'invalid_category',
    })
    expect(result.success).toBe(false)
  })

  it('should convert empty relatedEntityId to null', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'test.pdf',
      relatedEntityId: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.relatedEntityId).toBeNull()
    }
  })

  it('should reject invalid relatedEntityId UUID', () => {
    const result = uploadDocumentSchema.safeParse({
      name: 'test.pdf',
      relatedEntityId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})
