import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-KSEF-CREDENTIALS: KSeF Credential CRUD and Connectivity Testing
 *
 * Tests credential management:
 * 1. Create credential (token auth, demo environment)
 * 2. Test credential connectivity (POST /credentials/:id/test)
 * 3. List credentials
 * 4. Update credential
 * 5. Delete credential
 * 6. Reject duplicate NIP + environment
 * 7. Validate inactive credential test returns error
 */
test.describe('TC-KSEF-CREDENTIALS: Credential CRUD & Connectivity', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'admin')
  })

  test('create, list, test connectivity, update, and delete a credential', async ({ request }) => {
    const timestamp = Date.now()
    const testNip = `CRED${timestamp.toString().slice(-6)}`
    let credentialId: string | null = null

    try {
      // ── Step 1: Create credential ──────────────────────────────────
      await test.step('create credential with token auth, demo environment', async () => {
        const createResponse = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
          token,
          data: {
            nip: testNip,
            authType: 'token',
            environment: 'demo',
            label: `E2E Credential Test ${timestamp}`,
            ksefToken: 'test-demo-token-e2e-xyz-123',
          },
        })

        expect(createResponse.ok(), `Create credential failed: ${await createResponse.text()}`).toBe(true)
        const created = await createResponse.json() as {
          id: string
          nip: string
          authType: string
          environment: string
          isActive: boolean
          label: string
        }
        expect(created.id).toBeTruthy()
        expect(created.nip).toBe(testNip)
        expect(created.authType).toBe('token')
        expect(created.environment).toBe('demo')
        expect(created.isActive).toBe(true)
        expect(created.label).toBe(`E2E Credential Test ${timestamp}`)
        credentialId = created.id
      })

      // ── Step 2: Test connectivity ──────────────────────────────────
      await test.step('test credential connectivity — active credential', async () => {
        const testResponse = await apiRequest(request, 'POST', `/api/invoicing/credentials/${credentialId}/test`, {
          token,
        })
        expect(testResponse.ok(), `Connectivity test failed: ${await testResponse.text()}`).toBe(true)

        const testResult = await testResponse.json() as {
          success: boolean
          nip: string
          authType: string
          environment: string
          connectivity: { reachable: boolean; apiStatus: number | null; endpoint: string }
          message: string
        }

        expect(testResult.success).toBe(true)
        expect(testResult.nip).toBe(testNip)
        expect(testResult.authType).toBe('token')
        expect(testResult.environment).toBe('demo')
        expect(testResult.connectivity).toBeTruthy()
        expect(testResult.connectivity.endpoint).toContain('ksef')

        // Demo API should be reachable (connectivity check only, not auth)
        expect(testResult.connectivity.reachable).toBe(true)
        expect(testResult.message).toContain('reachable')
      })

      // ── Step 3: List credentials ───────────────────────────────────
      await test.step('list credentials — should contain our credential', async () => {
        const listResponse = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
        expect(listResponse.ok()).toBe(true)

        const listed = await listResponse.json() as {
          items: Array<{
            id: string
            nip: string
            authType: string
            environment: string
            isActive: boolean
            hasToken: boolean
            hasCertificate: boolean
            label: string | null
          }>
        }

        expect(Array.isArray(listed.items)).toBe(true)

        const found = listed.items.find((c) => c.id === credentialId)
        expect(found, 'Our credential should appear in the list').toBeTruthy()
        expect(found!.nip).toBe(testNip)
        expect(found!.hasToken).toBe(true)
        expect(found!.hasCertificate).toBe(false)
        expect(found!.isActive).toBe(true)
      })

      // ── Step 4: Update credential ──────────────────────────────────
      await test.step('update credential — change label and deactivate', async () => {
        const updateResponse = await apiRequest(request, 'PATCH', `/api/invoicing/credentials/${credentialId}`, {
          token,
          data: {
            label: 'Updated E2E Label',
            isActive: false,
          },
        })
        expect(updateResponse.ok(), `Update failed: ${await updateResponse.text()}`).toBe(true)

        const updated = await updateResponse.json() as {
          id: string
          label: string
          isActive: boolean
          hasToken: boolean
        }
        expect(updated.label).toBe('Updated E2E Label')
        expect(updated.isActive).toBe(false)
        expect(updated.hasToken).toBe(true)
      })

      // ── Step 5: Test connectivity on inactive credential → error ───
      await test.step('test inactive credential — should return 400', async () => {
        const testResponse = await apiRequest(request, 'POST', `/api/invoicing/credentials/${credentialId}/test`, {
          token,
        })
        expect(testResponse.status()).toBe(400)

        const body = await testResponse.json() as { error: string }
        expect(body.error).toContain('inactive')
      })

      // ── Step 6: Reactivate and verify connectivity again ───────────
      await test.step('reactivate credential and re-test connectivity', async () => {
        const reactivateRes = await apiRequest(request, 'PATCH', `/api/invoicing/credentials/${credentialId}`, {
          token,
          data: { isActive: true },
        })
        expect(reactivateRes.ok()).toBe(true)

        const retestResponse = await apiRequest(request, 'POST', `/api/invoicing/credentials/${credentialId}/test`, {
          token,
        })
        expect(retestResponse.ok()).toBe(true)

        const retestResult = await retestResponse.json() as { success: boolean }
        expect(retestResult.success).toBe(true)
      })

      // ── Step 7: Delete credential ──────────────────────────────────
      await test.step('delete credential', async () => {
        const deleteResponse = await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, {
          token,
        })
        expect(deleteResponse.ok(), `Delete failed: ${await deleteResponse.text()}`).toBe(true)

        const deleteBody = await deleteResponse.json() as { ok: boolean; id: string }
        expect(deleteBody.ok).toBe(true)
        expect(deleteBody.id).toBe(credentialId)
        credentialId = null
      })

      // ── Step 8: Verify deletion ────────────────────────────────────
      await test.step('verify credential no longer in list', async () => {
        const verifyResponse = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
        expect(verifyResponse.ok()).toBe(true)

        const verifyBody = await verifyResponse.json() as { items: Array<{ id: string }> }
        const stillExists = verifyBody.items.find((c) => c.id === credentialId)
        expect(stillExists).toBeUndefined()
      })
    } finally {
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })

  test('reject duplicate NIP + environment credential', async ({ request }) => {
    const dupNip = `DUP${Date.now().toString().slice(-6)}`
    let firstCredId: string | null = null

    try {
      // Create first credential
      const firstRes = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: dupNip,
          authType: 'token',
          environment: 'demo',
          ksefToken: 'dup-tok-1',
        },
      })
      expect(firstRes.ok(), `First create failed: ${await firstRes.text()}`).toBe(true)
      firstCredId = ((await firstRes.json()) as { id: string }).id

      // Attempt duplicate with same NIP + environment
      const secondRes = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: dupNip,
          authType: 'token',
          environment: 'demo',
          ksefToken: 'dup-tok-2',
        },
      })
      expect(secondRes.status()).toBe(409)

      const errorBody = await secondRes.json() as { error: string }
      expect(errorBody.error).toContain(dupNip)
    } finally {
      if (firstCredId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${firstCredId}`, { token }).catch(() => {})
      }
    }
  })

  test('same NIP with different environment is allowed', async ({ request }) => {
    const nipForEnvTest = `ENV${Date.now().toString().slice(-6)}`
    const credIds: string[] = []

    try {
      // Create credential for 'demo' environment
      const demoRes = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: nipForEnvTest,
          authType: 'token',
          environment: 'demo',
          label: 'Demo env',
          ksefToken: 'env-demo-tok',
        },
      })
      expect(demoRes.ok(), `Demo create failed: ${await demoRes.text()}`).toBe(true)
      credIds.push(((await demoRes.json()) as { id: string }).id)

      // Create credential for 'test' environment with same NIP — should succeed
      const testRes = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: nipForEnvTest,
          authType: 'token',
          environment: 'test',
          label: 'Test env',
          ksefToken: 'env-test-tok',
        },
      })
      expect(testRes.ok(), `Test env create failed: ${await testRes.text()}`).toBe(true)
      credIds.push(((await testRes.json()) as { id: string }).id)

      // Verify both exist
      const listRes = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
      expect(listRes.ok()).toBe(true)

      const listed = await listRes.json() as { items: Array<{ id: string; nip: string; environment: string }> }
      const matching = listed.items.filter((c) => c.nip === nipForEnvTest)
      expect(matching).toHaveLength(2)

      const environments = matching.map((c) => c.environment).sort()
      expect(environments).toEqual(['demo', 'test'])
    } finally {
      for (const id of credIds) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${id}`, { token }).catch(() => {})
      }
    }
  })

  test('update credential token', async ({ request }) => {
    const tokenNip = `TOK${Date.now().toString().slice(-6)}`
    let credId: string | null = null

    try {
      // Create credential
      const createRes = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: tokenNip,
          authType: 'token',
          environment: 'test',
          ksefToken: 'original-token-value',
        },
      })
      expect(createRes.ok()).toBe(true)
      credId = ((await createRes.json()) as { id: string }).id

      // Update the token
      const updateRes = await apiRequest(request, 'PATCH', `/api/invoicing/credentials/${credId}`, {
        token,
        data: {
          ksefToken: 'updated-token-value',
          label: 'Token was updated',
        },
      })
      expect(updateRes.ok()).toBe(true)

      const updated = await updateRes.json() as { hasToken: boolean; label: string }
      expect(updated.hasToken).toBe(true)
      expect(updated.label).toBe('Token was updated')

      // Verify in list — token should still show as present
      const listRes = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
      expect(listRes.ok()).toBe(true)

      const listed = await listRes.json() as { items: Array<{ id: string; hasToken: boolean }> }
      const found = listed.items.find((c) => c.id === credId)
      expect(found).toBeTruthy()
      expect(found!.hasToken).toBe(true)
    } finally {
      if (credId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credId}`, { token }).catch(() => {})
      }
    }
  })
})
