import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'

/**
 * TC-INV-006: Invoicing Settings — Navigation between settings pages
 */
test.describe('TC-INV-006: Settings Navigation', () => {
  test('should navigate between General, Credentials, and Sessions via sidebar', async ({ page }) => {
    await login(page, 'admin')

    // Start at General
    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')
    await expect(page.getByText('KSeF Integration')).toBeVisible()

    // Navigate to Credentials via sidebar
    await page.getByRole('link', { name: 'Credentials' }).click()
    await page.waitForURL('**/backend/invoicing/settings/credentials')
    await expect(page.getByText('KSeF Credentials')).toBeVisible()

    // Navigate to Sessions via sidebar
    await page.getByRole('link', { name: 'Sessions' }).click()
    await page.waitForURL('**/backend/invoicing/settings/sessions')
    await expect(page.getByText('KSeF Sessions')).toBeVisible()

    // Navigate back to General
    await page.getByRole('link', { name: 'General' }).click()
    await page.waitForURL('**/backend/invoicing/settings/general')
    await expect(page.getByText('KSeF Integration')).toBeVisible()
  })

  test('should show INVOICING section in settings sidebar', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/general')
    await page.waitForURL('**/backend/invoicing/settings/general')

    // Verify INVOICING section exists in sidebar
    await expect(page.getByText('INVOICING')).toBeVisible()

    // Verify all three links are present
    await expect(page.getByRole('link', { name: 'General' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Credentials' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sessions' })).toBeVisible()
  })
})
