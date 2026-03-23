import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-KSEF-E2E-SETTINGS: Settings page E2E tests
 *
 * 1. Navigate to /backend/invoicing/settings/general
 * 2. Change KSeF environment dropdown
 * 3. Toggle auto-submit
 * 4. Fill default seller NIP
 * 5. Save
 * 6. Verify persistence after reload
 */
test.describe('TC-KSEF-E2E-SETTINGS: KSeF Settings Page', () => {
  let originalSettings: Record<string, unknown> | null = null
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'admin')

    // Capture original settings for cleanup
    const response = await apiRequest(request, 'GET', '/api/invoicing/settings', { token })
    if (response.ok()) {
      originalSettings = await response.json() as Record<string, unknown>
    }
  })

  test.afterAll(async ({ request }) => {
    // Restore original settings
    if (originalSettings) {
      await apiRequest(request, 'PATCH', '/api/invoicing/settings', {
        token,
        data: {
          ksefEnvironment: originalSettings.ksefEnvironment,
          ksefAutoSubmit: originalSettings.ksefAutoSubmit,
          defaultSellerNip: originalSettings.defaultSellerNip,
          defaultPaymentMethod: originalSettings.defaultPaymentMethod,
          ksefSessionMode: originalSettings.ksefSessionMode,
          offlineMode: originalSettings.offlineMode,
        },
      }).catch(() => {})
    }
  })

  test('should display all general settings sections', async ({ page }) => {
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

    // Verify Company Details section
    await expect(page.getByText('Company Details (Seller)')).toBeVisible()
    await expect(page.getByText('Company name')).toBeVisible()
    await expect(page.getByText('NIP')).toBeVisible()

    // Verify Save button
    await expect(page.getByRole('button', { name: /Save Settings/i })).toBeVisible()
  })

  test('should change KSeF environment to demo and persist', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Wait for form to load
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    // Change KSeF environment dropdown to 'demo'
    const envSelect = page.locator('select').first()
    await envSelect.selectOption('demo')

    // Save
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText('KSeF Integration')).toBeVisible()
    await expect(envSelect).toHaveValue('demo')
  })

  test('should toggle auto-submit and persist', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Wait for form to load
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    // Find the auto-submit switch — it is near the "Auto-submit approved invoices" label
    const autoSubmitSwitch = page.getByRole('switch').first()

    // Get the current checked state
    const wasChecked = await autoSubmitSwitch.isChecked()

    // Toggle the switch
    await autoSubmitSwitch.click()

    // Save
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    const autoSubmitSwitchAfterReload = page.getByRole('switch').first()
    if (wasChecked) {
      await expect(autoSubmitSwitchAfterReload).not.toBeChecked()
    } else {
      await expect(autoSubmitSwitchAfterReload).toBeChecked()
    }

    // Toggle back to original state
    await autoSubmitSwitchAfterReload.click()
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })
  })

  test('should fill default seller NIP and persist', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Wait for form to load
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    // Fill the default seller NIP field
    const nipInput = page.getByPlaceholder('0000000000')
    await nipInput.fill('7451834739')

    // Save
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText('KSeF Integration')).toBeVisible()
    await expect(nipInput).toHaveValue('7451834739')

    // Clean up — restore empty NIP
    await nipInput.fill('')
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })
  })

  test('should change default payment method and persist', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Wait for form to load
    await expect(page.getByText('Invoice Defaults')).toBeVisible()

    // Find the payment method select — it is in the Invoice Defaults section
    // There are multiple selects on the page; the payment method one has the option "Bank transfer (przelew)"
    const paymentSelect = page.locator('select').filter({ hasText: 'Bank transfer' })

    // If payment select is visible, change it
    if (await paymentSelect.count() > 0) {
      await paymentSelect.first().selectOption('gotowka')
    }

    // Save
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText('Invoice Defaults')).toBeVisible()

    if (await paymentSelect.count() > 0) {
      await expect(paymentSelect.first()).toHaveValue('gotowka')
    }

    // Reset to no default
    if (await paymentSelect.count() > 0) {
      await paymentSelect.first().selectOption('')
    }
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })
  })

  test('should change session mode and offline mode', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Wait for form to load
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    // The selects on the page are (in order):
    // 1. KSeF Environment (test/demo/production)
    // 2. Session mode (interactive/batch)
    // 3. Offline mode (online/offline24/unavailability/emergency)
    // 4. Default payment method

    const selects = page.locator('select')
    const sessionModeSelect = selects.nth(1)
    const offlineModeSelect = selects.nth(2)

    // Change session mode to 'batch'
    await sessionModeSelect.selectOption('batch')

    // Change offline mode to 'offline24'
    await offlineModeSelect.selectOption('offline24')

    // Save
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    await expect(selects.nth(1)).toHaveValue('batch')
    await expect(selects.nth(2)).toHaveValue('offline24')

    // Reset
    await selects.nth(1).selectOption('interactive')
    await selects.nth(2).selectOption('online')
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })
  })

  test('should toggle import settings switches', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Wait for form to load
    await expect(page.getByText('Import Settings')).toBeVisible()

    // Find the import switches — they are the 2nd and 3rd switches on the page
    // Switch order: auto-submit, auto-import-from-documents, auto-import-from-sales
    const switches = page.getByRole('switch')

    // Get current states
    const docImportWasChecked = await switches.nth(1).isChecked()
    const salesImportWasChecked = await switches.nth(2).isChecked()

    // Toggle both
    await switches.nth(1).click()
    await switches.nth(2).click()

    // Save
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText('Import Settings')).toBeVisible()

    const switchesAfterReload = page.getByRole('switch')
    if (docImportWasChecked) {
      await expect(switchesAfterReload.nth(1)).not.toBeChecked()
    } else {
      await expect(switchesAfterReload.nth(1)).toBeChecked()
    }

    if (salesImportWasChecked) {
      await expect(switchesAfterReload.nth(2)).not.toBeChecked()
    } else {
      await expect(switchesAfterReload.nth(2)).toBeChecked()
    }

    // Toggle back to original states
    await switchesAfterReload.nth(1).click()
    await switchesAfterReload.nth(2).click()
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })
  })

  test('should fill all company detail fields and persist', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Wait for form to load
    await expect(page.getByText('Company Details (Seller)')).toBeVisible()

    // Fill company name
    const companyNameInput = page.getByPlaceholder('Your Company Sp. z o.o.')
    await companyNameInput.fill('E2E Test Company Sp. z o.o.')

    // Fill NIP
    const nipInput = page.getByPlaceholder('0000000000')
    await nipInput.fill('7451834739')

    // Fill address
    const addressInput = page.getByPlaceholder(/ul\. Przykładowa/)
    await addressInput.fill('ul. Testowa 1, 00-001 Warszawa')

    // Fill country code
    const countryInput = page.getByPlaceholder('PL')
    await countryInput.fill('PL')

    // Fill bank account
    const bankInput = page.getByPlaceholder(/PL00 0000/)
    await bankInput.fill('PL11 2222 3333 4444 5555 6666 7777')

    // Save
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText('Company Details (Seller)')).toBeVisible()

    await expect(companyNameInput).toHaveValue('E2E Test Company Sp. z o.o.')
    await expect(nipInput).toHaveValue('7451834739')
    await expect(addressInput).toHaveValue('ul. Testowa 1, 00-001 Warszawa')
    await expect(countryInput).toHaveValue('PL')
    await expect(bankInput).toHaveValue('PL11 2222 3333 4444 5555 6666 7777')

    // Clean up — clear all fields
    await companyNameInput.fill('')
    await nipInput.fill('')
    await addressInput.fill('')
    await countryInput.fill('')
    await bankInput.fill('')
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 5000 })
  })
})
