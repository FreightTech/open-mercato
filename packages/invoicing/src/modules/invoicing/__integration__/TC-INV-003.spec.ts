import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'

/**
 * TC-INV-003: Invoicing Settings — KSeF Sessions page
 */
test.describe('TC-INV-003: KSeF Sessions Page', () => {
  test('should display empty state for sessions', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing/settings/sessions')
    await page.waitForURL('**/backend/invoicing/settings/sessions')

    await expect(page.getByText('KSeF Sessions')).toBeVisible()
    await expect(page.getByText('No sessions yet')).toBeVisible()
    await expect(page.getByText('Sessions will appear here when invoices are submitted to KSeF')).toBeVisible()
  })
})
