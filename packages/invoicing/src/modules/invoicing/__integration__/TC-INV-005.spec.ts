import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-INV-005: KSeF Credentials API — CRUD and test connectivity
 */
test.describe('TC-INV-005: KSeF Credentials API', () => {
  let token: string
  const testNip = `QA${Date.now().toString().slice(-7)}`

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'admin')
  })

  test('should create, list, update, test, and delete a credential', async ({ request }) => {
    let credentialId: string | null = null

    try {
      // Create
      const createResponse = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: testNip,
          authType: 'token',
          environment: 'test',
          label: 'QA Integration Test',
          ksefToken: 'test-token-abc-123',
        },
      })
      expect(createResponse.ok()).toBeTruthy()
      const created = await createResponse.json() as { id: string; nip: string; authType: string }
      expect(created.id).toBeTruthy()
      expect(created.nip).toBe(testNip)
      expect(created.authType).toBe('token')
      credentialId = created.id

      // List — should contain our credential
      const listResponse = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
      expect(listResponse.ok()).toBeTruthy()
      const listed = await listResponse.json() as { items: Array<{ id: string; nip: string; hasToken: boolean }> }
      const found = listed.items.find((c) => c.id === credentialId)
      expect(found).toBeTruthy()
      expect(found!.hasToken).toBe(true)

      // Update — change label and deactivate
      const updateResponse = await apiRequest(request, 'PATCH', `/api/invoicing/credentials/${credentialId}`, {
        token,
        data: {
          label: 'QA Updated Label',
          isActive: false,
        },
      })
      expect(updateResponse.ok()).toBeTruthy()
      const updated = await updateResponse.json() as { label: string; isActive: boolean }
      expect(updated.label).toBe('QA Updated Label')
      expect(updated.isActive).toBe(false)

      // Test connectivity — should fail because credential is inactive
      const testResponse = await apiRequest(request, 'POST', `/api/invoicing/credentials/${credentialId}/test`, { token })
      const testResult = await testResponse.json() as { success?: boolean; error?: string }
      // Inactive credential should return error
      expect(testResponse.status()).toBe(400)

      // Reactivate and test again
      await apiRequest(request, 'PATCH', `/api/invoicing/credentials/${credentialId}`, {
        token,
        data: { isActive: true },
      })

      const testResponse2 = await apiRequest(request, 'POST', `/api/invoicing/credentials/${credentialId}/test`, { token })
      expect(testResponse2.ok()).toBeTruthy()
      const testResult2 = await testResponse2.json() as { success: boolean }
      expect(testResult2.success).toBe(true)

      // Delete
      const deleteResponse = await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token })
      expect(deleteResponse.ok()).toBeTruthy()
      credentialId = null

      // Verify deletion
      const verifyResponse = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
      const verifyBody = await verifyResponse.json() as { items: Array<{ id: string }> }
      expect(verifyBody.items.find((c) => c.id === created.id)).toBeUndefined()
    } finally {
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })

  test('should reject duplicate NIP + environment credential', async ({ request }) => {
    const dupNip = `DUP${Date.now().toString().slice(-7)}`
    let credentialId: string | null = null

    try {
      // Create first
      const first = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: { nip: dupNip, authType: 'token', environment: 'test', ksefToken: 'tok1' },
      })
      expect(first.ok()).toBeTruthy()
      credentialId = ((await first.json()) as { id: string }).id

      // Try duplicate
      const second = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: { nip: dupNip, authType: 'token', environment: 'test', ksefToken: 'tok2' },
      })
      expect(second.status()).toBe(409)
    } finally {
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })
})
