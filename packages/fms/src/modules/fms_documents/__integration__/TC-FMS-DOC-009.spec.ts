import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import {
  createDocumentFixture,
  deleteDocumentIfExists,
  getDocumentById,
  listDocuments,
} from './helpers'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-FMS-DOC-009: Delete Document
 *
 * Tests deleting documents via API.
 */
test.describe('TC-FMS-DOC-009: Delete Document', () => {
  let authToken: string
  const testPrefix = `delete-test-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')
  })

  test('should delete document successfully', async ({ request }) => {
    // Create a document to delete
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-to-delete`,
      category: 'other',
      description: 'Document created for deletion test',
    })

    expect(doc).not.toBeNull()
    expect(doc!.id).toBeDefined()

    // Verify document exists
    const beforeDelete = await getDocumentById(request, authToken, doc!.id)
    expect(beforeDelete).not.toBeNull()

    // Delete the document
    const deleteResponse = await request.fetch(
      `${BASE_URL}/api/fms_documents/documents/${doc!.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    expect(deleteResponse.ok()).toBe(true)

    // Verify document is gone (or soft-deleted)
    const afterDelete = await getDocumentById(request, authToken, doc!.id)
    // Document should either be null or have deletedAt set
    if (afterDelete !== null) {
      expect(afterDelete.deletedAt).toBeDefined()
    }
  })

  test('should return 404 when deleting non-existent document', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const response = await request.fetch(
      `${BASE_URL}/api/fms_documents/documents/${fakeId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    expect(response.ok()).toBe(false)
    expect(response.status()).toBe(404)
  })

  test('should require authentication for delete', async ({ request }) => {
    // Create a document first
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-auth-test`,
      category: 'other',
    })

    try {
      // Try to delete without auth
      const response = await request.fetch(
        `${BASE_URL}/api/fms_documents/documents/${doc!.id}`,
        { method: 'DELETE' }
      )

      expect(response.ok()).toBe(false)
      expect(response.status()).toBe(401)
    } finally {
      // Clean up
      await deleteDocumentIfExists(request, authToken, doc?.id ?? null)
    }
  })

  test('should not show deleted documents in list by default', async ({ request }) => {
    // Create a document
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-hide-in-list`,
      category: 'other',
    })

    expect(doc).not.toBeNull()

    // Delete it
    await request.fetch(`${BASE_URL}/api/fms_documents/documents/${doc!.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    })

    // Search for it - should not appear
    const docs = await listDocuments(request, authToken, {
      search: `${testPrefix}-hide-in-list`,
    })

    const found = docs.find((d) => d.id === doc!.id)
    expect(found).toBeUndefined()
  })

  test('should handle idempotent delete (delete same document twice)', async ({ request }) => {
    // Create a document
    const doc = await createDocumentFixture(request, authToken, {
      name: `${testPrefix}-idempotent`,
      category: 'other',
    })

    expect(doc).not.toBeNull()

    // Delete first time
    const firstDelete = await request.fetch(
      `${BASE_URL}/api/fms_documents/documents/${doc!.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    expect(firstDelete.ok()).toBe(true)

    // Delete second time - should either succeed (idempotent) or return 404
    const secondDelete = await request.fetch(
      `${BASE_URL}/api/fms_documents/documents/${doc!.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    // Either 200 (idempotent) or 404 (already deleted) is acceptable
    expect([200, 204, 404]).toContain(secondDelete.status())
  })
})
