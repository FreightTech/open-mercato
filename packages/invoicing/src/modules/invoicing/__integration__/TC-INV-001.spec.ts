import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-INV-001: Invoicing Settings — General settings page loads and saves
 */
test.describe('TC-INV-001: Invoicing General Settings', () => {
  test('should display the general settings page with all fields', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Verify section headings
    await expect(page.getByText('KSeF Integration')).toBeVisible()
    await expect(page.getByText('Invoice Defaults')).toBeVisible()
    await expect(page.getByText('Import Settings')).toBeVisible()

    // Verify form fields exist
    await expect(page.getByText('KSeF Environment')).toBeVisible()
    await expect(page.getByText('Session mode')).toBeVisible()
    await expect(page.getByText('Offline mode')).toBeVisible()
    await expect(page.getByText('Auto-submit approved invoices')).toBeVisible()
    await expect(page.getByText('Default seller NIP')).toBeVisible()
    await expect(page.getByText('Default payment method')).toBeVisible()
    await expect(page.getByText('Auto-import from documents')).toBeVisible()
    await expect(page.getByText('Auto-import from sales')).toBeVisible()

    // Verify Save button
    await expect(page.getByRole('button', { name: /Save Settings/i })).toBeVisible()
  })

  test('should save settings and persist changes', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Wait for form to load
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    // Change the NIP field
    const nipInput = page.getByPlaceholder('0000000000')
    await nipInput.fill('1234567890')

    // Save
    await page.getByRole('button', { name: /Save Settings/i }).click()

    // Verify success flash
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText('KSeF Integration')).toBeVisible()
    await expect(nipInput).toHaveValue('1234567890')

    // Clean up — reset NIP to empty
    await nipInput.fill('')
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })
  })
})
