import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'

async function getToken(request: any): Promise<string> {
  const form = new URLSearchParams()
  form.set('email', 'superadmin@acme.com')
  form.set('password', 'secret')
  const response = await request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: form.toString(),
  })
  const body = await response.json()
  if (!response.ok() || !body.token) throw new Error(`Login failed: ${response.status()}`)
  return body.token as string
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/**
 * TC-INV-004: Invoicing Settings API — CRUD operations
 */
test.describe('TC-INV-004: Invoicing Settings API', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getToken(request)
  })

  test('GET /api/fms_invoicing/settings should return default settings', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/fms_invoicing/settings`, {
      headers: authHeaders(token),
    })
    expect(response.ok()).toBeTruthy()

    const body = await response.json() as Record<string, unknown>
    expect(body.autoImportFromDocuments).toBeDefined()
    expect(body.autoImportFromSales).toBeDefined()
  })

  test('PATCH /api/fms_invoicing/settings should update and persist', async ({ request }) => {
    const originalResponse = await request.get(`${BASE_URL}/api/fms_invoicing/settings`, {
      headers: authHeaders(token),
    })
    const original = await originalResponse.json() as Record<string, unknown>

    try {
      const updateResponse = await request.patch(`${BASE_URL}/api/fms_invoicing/settings`, {
        headers: authHeaders(token),
        data: {
          defaultSellerNip: '1112223344',
          defaultSellerName: 'Test Company Sp. z o.o.',
        },
      })
      expect(updateResponse.ok()).toBeTruthy()

      const updated = await updateResponse.json() as Record<string, unknown>
      expect(updated.defaultSellerNip).toBe('1112223344')
      expect(updated.defaultSellerName).toBe('Test Company Sp. z o.o.')

      const verifyResponse = await request.get(`${BASE_URL}/api/fms_invoicing/settings`, {
        headers: authHeaders(token),
      })
      const verified = await verifyResponse.json() as Record<string, unknown>
      expect(verified.defaultSellerNip).toBe('1112223344')
      expect(verified.defaultSellerName).toBe('Test Company Sp. z o.o.')
    } finally {
      await request.patch(`${BASE_URL}/api/fms_invoicing/settings`, {
        headers: authHeaders(token),
        data: {
          defaultSellerNip: original.defaultSellerNip,
          defaultSellerName: original.defaultSellerName,
        },
      })
    }
  })
})
