import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-INV-004: Invoicing Settings API — CRUD operations
 */
test.describe('TC-INV-004: Invoicing Settings API', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'admin')
  })

  test('GET /api/invoicing/settings should return default settings', async ({ request }) => {
    const response = await apiRequest(request, 'GET', '/api/invoicing/settings', { token })
    expect(response.ok()).toBeTruthy()

    const body = await response.json() as Record<string, unknown>
    expect(body.ksefEnvironment).toBeDefined()
    expect(body.ksefAutoSubmit).toBeDefined()
    expect(body.ksefSessionMode).toBeDefined()
    expect(body.offlineMode).toBeDefined()
    expect(body.autoImportFromDocuments).toBeDefined()
    expect(body.autoImportFromSales).toBeDefined()
  })

  test('PATCH /api/invoicing/settings should update and persist', async ({ request }) => {
    // Save original state
    const originalResponse = await apiRequest(request, 'GET', '/api/invoicing/settings', { token })
    const original = await originalResponse.json() as Record<string, unknown>

    try {
      // Update
      const updateResponse = await apiRequest(request, 'PATCH', '/api/invoicing/settings', {
        token,
        data: {
          ksefEnvironment: 'demo',
          ksefAutoSubmit: true,
          defaultSellerNip: '1112223344',
        },
      })
      expect(updateResponse.ok()).toBeTruthy()

      const updated = await updateResponse.json() as Record<string, unknown>
      expect(updated.ksefEnvironment).toBe('demo')
      expect(updated.ksefAutoSubmit).toBe(true)
      expect(updated.defaultSellerNip).toBe('1112223344')

      // Verify persistence via GET
      const verifyResponse = await apiRequest(request, 'GET', '/api/invoicing/settings', { token })
      const verified = await verifyResponse.json() as Record<string, unknown>
      expect(verified.ksefEnvironment).toBe('demo')
      expect(verified.ksefAutoSubmit).toBe(true)
      expect(verified.defaultSellerNip).toBe('1112223344')
    } finally {
      // Restore original
      await apiRequest(request, 'PATCH', '/api/invoicing/settings', {
        token,
        data: {
          ksefEnvironment: original.ksefEnvironment,
          ksefAutoSubmit: original.ksefAutoSubmit,
          defaultSellerNip: original.defaultSellerNip,
        },
      })
    }
  })
})
