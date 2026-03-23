import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-KSEF-E2E-CREDENTIALS: Credential management UI E2E tests
 *
 * 1. Navigate to /backend/invoicing/settings/credentials
 * 2. Add new credential (token auth)
 * 3. Test credential connectivity
 * 4. Delete credential
 */
test.describe('TC-KSEF-E2E-CREDENTIALS: KSeF Credential Management UI', () => {
  const testNip = `E2E${Date.now().toString().slice(-7)}`
  const testLabel = `E2E Credential ${Date.now()}`

  test('should display credentials page with Add Credential button', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/credentials')
    await page.waitForURL('**/backend/invoicing/settings/credentials')

    await expect(page.getByText('KSeF Credentials')).toBeVisible()
    await expect(page.getByRole('button', { name: /Add Credential/i })).toBeVisible()
  })

  test('should create a new credential via dialog', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')
    await login(page, 'admin')

    let credentialId: string | null = null

    try {
      await page.goto('/backend/invoicing/settings/credentials')
      await page.waitForURL('**/backend/invoicing/settings/credentials')

      // Open create dialog
      await page.getByRole('button', { name: /Add Credential/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      // Verify dialog title
      await expect(page.getByText('Add Credential')).toBeVisible()

      // Fill NIP
      await page.getByPlaceholder('0000000000').fill(testNip)

      // Fill label
      await page.getByPlaceholder('e.g. Main company credential').fill(testLabel)

      // Environment should default to 'test'
      // Auth type should default to 'token'

      // Fill KSeF token
      const tokenTextarea = page.getByPlaceholder(/Paste KSeF authorization token/i)
      await tokenTextarea.fill('test-token-value-e2e-12345')

      // Submit via Create button
      await page.getByRole('button', { name: 'Create' }).click()

      // Verify success flash
      await expect(page.getByText('Credential created')).toBeVisible({ timeout: 5000 })

      // Verify credential appears in the table
      await expect(page.getByText(testNip)).toBeVisible()
      await expect(page.getByText(testLabel)).toBeVisible()

      // Verify auth type badge shows 'Token'
      await expect(page.getByText('Token')).toBeVisible()

      // Verify environment badge shows 'test'
      await expect(page.locator('span').filter({ hasText: 'test' }).first()).toBeVisible()

      // Get the credential ID via API for cleanup
      const listResponse = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
      const listBody = await listResponse.json() as { items: Array<{ id: string; nip: string }> }
      const created = listBody.items.find((c) => c.nip === testNip)
      credentialId = created?.id ?? null
    } finally {
      // Safety cleanup via API
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })

  test('should test credential connectivity', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')
    await login(page, 'admin')

    let credentialId: string | null = null
    const testConnNip = `CON${Date.now().toString().slice(-7)}`

    try {
      // Create credential via API first
      const createResponse = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: testConnNip,
          authType: 'token',
          environment: 'test',
          label: 'Connectivity Test',
          ksefToken: 'test-token-connectivity',
        },
      })
      expect(createResponse.ok()).toBeTruthy()
      const created = await createResponse.json() as { id: string }
      credentialId = created.id

      // Navigate to credentials page
      await page.goto('/backend/invoicing/settings/credentials')
      await page.waitForURL('**/backend/invoicing/settings/credentials')

      // Wait for the credential to appear in the table
      await expect(page.getByText(testConnNip)).toBeVisible({ timeout: 5000 })

      // Find the row with our test credential and click the Test button (Zap icon)
      const row = page.getByRole('row').filter({ hasText: testConnNip })
      const testButton = row.getByTitle('Test')
      await testButton.click()

      // Wait for test result — either "Connection test passed" or "Connection test failed"
      const passedMessage = page.getByText('Connection test passed')
      const failedMessage = page.getByText('Connection test failed')
      await expect(passedMessage.or(failedMessage)).toBeVisible({ timeout: 10000 })
    } finally {
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })

  test('should delete credential via UI', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')
    await login(page, 'admin')

    let credentialId: string | null = null
    const deleteNip = `DEL${Date.now().toString().slice(-7)}`

    try {
      // Create credential via API first
      const createResponse = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: deleteNip,
          authType: 'token',
          environment: 'test',
          label: 'To Be Deleted',
          ksefToken: 'test-token-delete',
        },
      })
      expect(createResponse.ok()).toBeTruthy()
      const created = await createResponse.json() as { id: string }
      credentialId = created.id

      // Navigate to credentials page
      await page.goto('/backend/invoicing/settings/credentials')
      await page.waitForURL('**/backend/invoicing/settings/credentials')

      // Wait for the credential to appear
      await expect(page.getByText(deleteNip)).toBeVisible({ timeout: 5000 })

      // Find the row and click the Delete button (Trash icon)
      const row = page.getByRole('row').filter({ hasText: deleteNip })
      await row.locator('button[title="Delete"]').click()

      // Confirm deletion in the confirmation dialog
      const confirmButton = page.getByRole('button', { name: /Delete|Confirm/i }).last()
      await confirmButton.click()

      // Verify deletion success flash
      await expect(page.getByText('Credential deleted')).toBeVisible({ timeout: 5000 })

      // Verify the credential is no longer in the table
      await expect(page.getByText(deleteNip)).not.toBeVisible({ timeout: 3000 })
      credentialId = null // Already cleaned up
    } finally {
      // Safety cleanup via API in case UI deletion failed
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })

  test('should edit credential via dialog', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')
    await login(page, 'admin')

    let credentialId: string | null = null
    const editNip = `EDT${Date.now().toString().slice(-7)}`
    const originalLabel = 'Original Label'
    const updatedLabel = 'Updated Label E2E'

    try {
      // Create credential via API first
      const createResponse = await apiRequest(request, 'POST', '/api/invoicing/credentials', {
        token,
        data: {
          nip: editNip,
          authType: 'token',
          environment: 'test',
          label: originalLabel,
          ksefToken: 'test-token-edit',
        },
      })
      expect(createResponse.ok()).toBeTruthy()
      const created = await createResponse.json() as { id: string }
      credentialId = created.id

      // Navigate to credentials page
      await page.goto('/backend/invoicing/settings/credentials')
      await page.waitForURL('**/backend/invoicing/settings/credentials')

      // Wait for the credential to appear
      await expect(page.getByText(editNip)).toBeVisible({ timeout: 5000 })
      await expect(page.getByText(originalLabel)).toBeVisible()

      // Find the row and click Edit button (Pencil icon)
      const row = page.getByRole('row').filter({ hasText: editNip })
      const editButton = row.getByTitle('Edit')
      await editButton.click()

      // Verify edit dialog opens
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Edit Credential')).toBeVisible()

      // Change the label
      const labelInput = page.getByPlaceholder('e.g. Main company credential')
      await labelInput.fill(updatedLabel)

      // Change environment to 'demo'
      const envSelect = page.getByRole('dialog').locator('select').first()
      await envSelect.selectOption('demo')

      // Save
      await page.getByRole('button', { name: 'Save' }).click()

      // Verify success flash
      await expect(page.getByText('Credential updated')).toBeVisible({ timeout: 5000 })

      // Verify updated label appears in table
      await expect(page.getByText(updatedLabel)).toBeVisible({ timeout: 3000 })
    } finally {
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })

  test('should submit create dialog with Cmd+Enter shortcut', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')
    await login(page, 'admin')

    let credentialId: string | null = null
    const shortcutNip = `SHK${Date.now().toString().slice(-7)}`

    try {
      await page.goto('/backend/invoicing/settings/credentials')
      await page.waitForURL('**/backend/invoicing/settings/credentials')

      // Open create dialog
      await page.getByRole('button', { name: /Add Credential/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      // Fill form
      await page.getByPlaceholder('0000000000').fill(shortcutNip)
      await page.getByPlaceholder('e.g. Main company credential').fill('Shortcut Test')
      await page.getByPlaceholder(/Paste KSeF authorization token/i).fill('shortcut-token')

      // Submit via Cmd+Enter (macOS) or Ctrl+Enter
      await page.getByRole('dialog').press('Meta+Enter')

      // Verify success
      await expect(page.getByText('Credential created')).toBeVisible({ timeout: 5000 })

      // Get credential ID for cleanup
      const listResponse = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
      const listBody = await listResponse.json() as { items: Array<{ id: string; nip: string }> }
      const created = listBody.items.find((c) => c.nip === shortcutNip)
      credentialId = created?.id ?? null
    } finally {
      if (credentialId) {
        await apiRequest(request, 'DELETE', `/api/invoicing/credentials/${credentialId}`, { token }).catch(() => {})
      }
    }
  })

  test('should navigate to credentials page from settings sidebar', async ({ page }) => {
    await login(page, 'admin')

    // Start at general settings
    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    // Navigate to Credentials via sidebar
    await page.getByRole('link', { name: 'Credentials' }).click()
    await page.waitForURL('**/backend/invoicing/settings/credentials')
    await expect(page.getByText('KSeF Credentials')).toBeVisible()
    await expect(page.getByRole('button', { name: /Add Credential/i })).toBeVisible()
  })

  test('should show empty state when no credentials exist', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')
    await login(page, 'admin')

    // Clean up any existing test credentials first
    const listResponse = await apiRequest(request, 'GET', '/api/invoicing/credentials', { token })
    const listBody = await listResponse.json() as { items: Array<{ id: string }> }

    // Check the page — if there are no credentials, we should see the empty state
    await page.goto('/backend/invoicing/settings/credentials')
    await page.waitForURL('**/backend/invoicing/settings/credentials')

    await expect(page.getByText('KSeF Credentials')).toBeVisible()

    if (listBody.items.length === 0) {
      // Verify empty state UI
      await expect(page.getByText('No credentials configured')).toBeVisible()
      await expect(page.getByText('Add a KSeF credential to start submitting invoices')).toBeVisible()
    } else {
      // Credentials exist — verify the table is shown
      await expect(page.locator('table')).toBeVisible()
    }
  })
})
