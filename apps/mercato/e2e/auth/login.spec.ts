import { test, expect } from '@playwright/test'

/**
 * Login Page E2E Test
 *
 * Simple smoke test to verify E2E infrastructure is working.
 */
test('should display login page', async ({ page }) => {
  await page.goto('/login')

  // Verify email input is visible
  await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
})
