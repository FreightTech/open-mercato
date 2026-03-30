import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-INV-002: Invoicing Settings — KSeF Credentials CRUD
 */
test.describe('TC-INV-002: KSeF Credentials CRUD', () => {
  const testNip = '9999999999'
  const testLabel = `QA Credential ${Date.now()}`

  test('should display empty state when no credentials exist', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/credentials')
    await page.waitForURL('**/backend/invoicing/settings/credentials')

    await expect(page.getByText('KSeF Credentials')).toBeVisible()
    await expect(page.getByRole('button', { name: /Add Credential/i })).toBeVisible()
  })

  test('should create, view, and delete a credential', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')
    await login(page, 'admin')

    let credentialId: string | null = null

    try {
      await page.goto('/backend/invoicing/settings/credentials')
      await page.waitForURL('**/backend/invoicing/settings/credentials')

      // Open create dialog
      await page.getByRole('button', { name: /Add Credential/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      // Fill form
      await page.getByPlaceholder('0000000000').fill(testNip)
      await page.getByPlaceholder('e.g. Main company credential').fill(testLabel)

      // Select environment (the select is a native <select>)
      // Token field should be visible by default (auth type = token)
      await page.getByPlaceholder(/Paste KSeF authorization token/i).fill('test-token-value-12345')

      // Submit
      await page.getByRole('button', { name: 'Create' }).click()

      // Verify success
      await expect(page.getByText('Credential created')).toBeVisible({ timeout: 5000 })

      // Verify credential appears in table
      await expect(page.getByText(testNip)).toBeVisible()
      await expect(page.getByText(testLabel)).toBeVisible()

      // Get the credential ID via API for cleanup
      const listResponse = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
      const listBody = await listResponse.json() as { items: Array<{ id: string; nip: string }> }
      const created = listBody.items.find((c) => c.nip === testNip)
      credentialId = created?.id ?? null

      // Delete via UI
      const row = page.getByRole('row').filter({ hasText: testNip })
      await row.getByTitle('Delete').click()

      // Confirm deletion dialog
      const confirmButton = page.getByRole('button', { name: /Delete|Confirm/i }).last()
      await confirmButton.click()

      // Verify deleted
      await expect(page.getByText('Credential deleted')).toBeVisible({ timeout: 5000 })
      credentialId = null // Already cleaned up
    } finally {
      // Safety cleanup via API
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })
})
