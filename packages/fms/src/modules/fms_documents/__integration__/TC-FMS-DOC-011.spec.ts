import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createDocumentFixture,
  deleteDocumentIfExists,
  getDocumentById,
  updateDocumentFixture,
  patchDocumentData,
} from './helpers'

/**
 * TC-FMS-DOC-011: Edit Document Metadata
 *
 * Tests updating document metadata via API.
 * - PUT is used for basic metadata: name, category, description
 * - PATCH is used for extracted data: sellerName, buyerName, vesselName, etc.
 */
test.describe('TC-FMS-DOC-011: Edit Document Metadata', () => {
  let authToken: string
  const testPrefix = `edit-test-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')
  })

  test('should update document name', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-original-name`,
      category: 'invoice',
    })

    expect(doc).not.toBeNull()

    try {
      const updated = await updateDocumentFixture(request, authToken, doc!.id, {
        name: `${testPrefix}-updated-name`,
      })

      expect(updated).not.toBeNull()
      expect(updated!.name).toBe(`${testPrefix}-updated-name`)

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched?.name).toBe(`${testPrefix}-updated-name`)
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should update document category', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-category-test`,
      category: 'invoice',
    })

    expect(doc).not.toBeNull()

    try {
      const updated = await updateDocumentFixture(request, authToken, doc!.id, {
        category: 'bill_of_lading',
      })

      expect(updated).not.toBeNull()
      expect(updated!.category).toBe('bill_of_lading')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should update document description', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-desc-test`,
      category: 'other',
      description: 'Original description',
    })

    expect(doc).not.toBeNull()

    try {
      await updateDocumentFixture(request, authToken, doc!.id, {
        description: 'Updated description with more details',
      })

      // Verify via GET (PUT response doesn't include description)
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.description).toBe('Updated description with more details')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should update multiple fields at once', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-multi-field`,
      category: 'invoice',
      description: 'Original',
      sellerName: 'Original Seller',
    })

    expect(doc).not.toBeNull()

    try {
      // Update basic metadata via PUT
      await updateDocumentFixture(request, authToken, doc!.id, {
        name: `${testPrefix}-multi-field-updated`,
        description: 'Updated description',
      })

      // Update extracted data via PATCH
      await patchDocumentData(request, authToken, doc!.id, {
        sellerName: 'New Seller Inc',
        buyerName: 'New Buyer Corp',
        totalGrossAmount: '5000',
        currency: 'USD',
      })

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.name).toBe(`${testPrefix}-multi-field-updated`)
      expect(fetched!.description).toBe('Updated description')
      expect(fetched!.sellerName).toBe('New Seller Inc')
      expect(fetched!.buyerName).toBe('New Buyer Corp')
      // totalGrossAmount may be formatted with decimals (e.g., "5000.00")
      expect(String(fetched!.totalGrossAmount).startsWith('5000')).toBe(true)
      expect(fetched!.currency).toBe('USD')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should preserve unchanged fields when updating', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-preserve-test`,
      category: 'invoice',
      description: 'Should be preserved',
      sellerName: 'Preserved Seller',
    })

    expect(doc).not.toBeNull()

    try {
      // Only update name
      await updateDocumentFixture(request, authToken, doc!.id, {
        name: `${testPrefix}-preserve-test-new`,
      })

      // Verify via GET that other fields are preserved
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.name).toBe(`${testPrefix}-preserve-test-new`)
      // Other fields should be preserved
      expect(fetched!.category).toBe('invoice')
      expect(fetched!.description).toBe('Should be preserved')
      expect(fetched!.sellerName).toBe('Preserved Seller')
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should handle empty string updates', async ({ request }) => {
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-empty-test`,
      category: 'invoice',
      description: 'Has description',
    })

    expect(doc).not.toBeNull()

    try {
      // Clear description
      await updateDocumentFixture(request, authToken, doc!.id, {
        description: null,
      })

      // Verify via GET
      const fetched = await getDocumentById(request, authToken, doc!.id)
      expect(fetched).not.toBeNull()
      // Description should be null
      expect(fetched!.description).toBeNull()
    } finally {
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })
})
