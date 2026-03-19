import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createDocumentFixture,
  deleteDocumentsIfExist,
  listDocumentsWithPagination,
  type DocumentCategory,
} from './helpers'

/**
 * TC-FMS-DOC-004-007: Document List Operations
 *
 * Tests the document list API for:
 * - TC-FMS-DOC-004: Pagination
 * - TC-FMS-DOC-005: Search
 * - TC-FMS-DOC-006: Filter by category
 * - TC-FMS-DOC-007: Sort
 */
test.describe('TC-FMS-DOC-004-007: Document List Operations', () => {
  let authToken: string
  const createdDocumentIds: string[] = []
  const testPrefix = `test-list-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    // Create test documents with different categories and names
    const testDocuments = [
      { name: `${testPrefix}-invoice-alpha`, category: 'invoice' as DocumentCategory, sellerName: 'Alpha Corp', totalGrossAmount: 1000 },
      { name: `${testPrefix}-invoice-beta`, category: 'invoice' as DocumentCategory, sellerName: 'Beta Inc', totalGrossAmount: 2000 },
      { name: `${testPrefix}-invoice-gamma`, category: 'invoice' as DocumentCategory, sellerName: 'Gamma Ltd', totalGrossAmount: 500 },
      { name: `${testPrefix}-bol-alpha`, category: 'bill_of_lading' as DocumentCategory, vesselName: 'MSC Alpha', blNumber: 'BL001' },
      { name: `${testPrefix}-bol-beta`, category: 'bill_of_lading' as DocumentCategory, vesselName: 'MSC Beta', blNumber: 'BL002' },
      { name: `${testPrefix}-booking-alpha`, category: 'booking_confirmation' as DocumentCategory, bookingNumber: 'BK001', vesselName: 'Evergreen One' },
      { name: `${testPrefix}-packing-alpha`, category: 'packing_list' as DocumentCategory, description: 'Packing list for shipment' },
    ]

    for (const doc of testDocuments) {
      const created = await createDocumentFixture(request, authToken, doc)
      if (created?.id) {
        createdDocumentIds.push(created.id)
      }
    }

    // Verify we created enough test documents
    expect(createdDocumentIds.length).toBeGreaterThanOrEqual(5)
  })

  test.afterAll(async ({ request }) => {
    await deleteDocumentsIfExist(request, authToken, createdDocumentIds)
  })

  test('TC-FMS-DOC-004: should paginate document list', async ({ request }) => {
    // List with small page size
    const page1 = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      page: 1,
      limit: 3,
    })

    expect(page1.items.length).toBeLessThanOrEqual(3)
    expect(page1.total).toBeGreaterThanOrEqual(5)
    expect(page1.page).toBe(1)
    expect(page1.limit).toBe(3)

    // Get page 2
    const page2 = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      page: 2,
      limit: 3,
    })

    expect(page2.page).toBe(2)
    // Page 2 should have different items than page 1
    const page1Ids = new Set(page1.items.map((d) => d.id))
    const page2HasDifferentItems = page2.items.some((d) => !page1Ids.has(d.id))
    if (page2.items.length > 0) {
      expect(page2HasDifferentItems).toBe(true)
    }
  })

  test('TC-FMS-DOC-005: should search documents by name', async ({ request }) => {
    // Search for "invoice-alpha"
    const result = await listDocumentsWithPagination(request, authToken, {
      search: `${testPrefix}-invoice-alpha`,
    })

    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.some((d) => d.name.includes('invoice-alpha'))).toBe(true)
  })

  test('TC-FMS-DOC-005: should search documents by seller name', async ({ request }) => {
    // Search for "Beta Inc" (seller name)
    const result = await listDocumentsWithPagination(request, authToken, {
      search: 'Beta Inc',
    })

    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.some((d) => d.sellerName === 'Beta Inc')).toBe(true)
  })

  test('TC-FMS-DOC-005: should search documents by vessel name', async ({ request }) => {
    // Search for "MSC Alpha" (vessel name)
    const result = await listDocumentsWithPagination(request, authToken, {
      search: 'MSC Alpha',
    })

    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.some((d) => d.vesselName === 'MSC Alpha')).toBe(true)
  })

  test('TC-FMS-DOC-005: should return empty for non-matching search', async ({ request }) => {
    const result = await listDocumentsWithPagination(request, authToken, {
      search: 'nonexistent-document-xyz-123456',
    })

    expect(result.items.length).toBe(0)
  })

  test('TC-FMS-DOC-006: should filter documents by category', async ({ request }) => {
    // Filter by invoice category
    const invoices = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      category: 'invoice',
    })

    expect(invoices.items.length).toBeGreaterThanOrEqual(3)
    expect(invoices.items.every((d) => d.category === 'invoice')).toBe(true)

    // Filter by bill_of_lading category
    const bols = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      category: 'bill_of_lading',
    })

    expect(bols.items.length).toBeGreaterThanOrEqual(2)
    expect(bols.items.every((d) => d.category === 'bill_of_lading')).toBe(true)

    // Filter by booking_confirmation category
    const bookings = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      category: 'booking_confirmation',
    })

    expect(bookings.items.length).toBeGreaterThanOrEqual(1)
    expect(bookings.items.every((d) => d.category === 'booking_confirmation')).toBe(true)
  })

  test('TC-FMS-DOC-007: should sort documents by name ascending', async ({ request }) => {
    const result = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      sortField: 'name',
      sortDir: 'asc',
    })

    expect(result.items.length).toBeGreaterThanOrEqual(2)

    // Verify ascending order
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i].name.localeCompare(result.items[i - 1].name)).toBeGreaterThanOrEqual(0)
    }
  })

  test('TC-FMS-DOC-007: should sort documents by name descending', async ({ request }) => {
    const result = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      sortField: 'name',
      sortDir: 'desc',
    })

    expect(result.items.length).toBeGreaterThanOrEqual(2)

    // Verify descending order
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i].name.localeCompare(result.items[i - 1].name)).toBeLessThanOrEqual(0)
    }
  })

  test('TC-FMS-DOC-007: should sort documents by createdAt', async ({ request }) => {
    const resultDesc = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      sortField: 'createdAt',
      sortDir: 'desc',
    })

    expect(resultDesc.items.length).toBeGreaterThanOrEqual(2)

    // Verify descending order (most recent first)
    for (let i = 1; i < resultDesc.items.length; i++) {
      if (resultDesc.items[i].createdAt && resultDesc.items[i - 1].createdAt) {
        expect(new Date(resultDesc.items[i].createdAt!).getTime())
          .toBeLessThanOrEqual(new Date(resultDesc.items[i - 1].createdAt!).getTime())
      }
    }
  })

  test('should combine search, filter, and pagination', async ({ request }) => {
    // Combine search with category filter
    const result = await listDocumentsWithPagination(request, authToken, {
      search: testPrefix,
      category: 'invoice',
      page: 1,
      limit: 2,
      sortField: 'name',
      sortDir: 'asc',
    })

    expect(result.items.length).toBeLessThanOrEqual(2)
    expect(result.items.every((d) => d.category === 'invoice')).toBe(true)
    expect(result.items.every((d) => d.name.includes(testPrefix))).toBe(true)
  })
})
