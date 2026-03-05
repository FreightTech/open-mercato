import { test as base, expect, Page } from '@playwright/test'

/**
 * Test credentials - these should match users created in global-setup.ts
 * In CI, these are seeded during database initialization.
 */
export const TEST_USERS = {
  admin: {
    email: 'admin@test.local',
    password: 'TestAdmin123!',
  },
  user: {
    email: 'user@test.local',
    password: 'TestUser123!',
  },
} as const

type AuthFixtures = {
  /**
   * A page that is already authenticated as a regular user.
   * Use this for tests that don't require admin privileges.
   */
  authenticatedPage: Page

  /**
   * A page that is already authenticated as an admin user.
   * Use this for tests requiring elevated permissions.
   */
  adminPage: Page
}

/**
 * Helper function to perform login on a page.
 * Waits for successful redirect to backend.
 */
async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  // Fill login form
  await page.locator('input[name="email"], input[type="email"]').fill(email)
  await page.locator('input[name="password"], input[type="password"]').fill(password)

  // Submit form
  await page.locator('button[type="submit"]').click()

  // Wait for successful login - should redirect to backend
  await page.waitForURL(/\/backend/, { timeout: 10000 })
}

/**
 * Extended test with authentication fixtures.
 *
 * Usage:
 *   import { test, expect } from '../fixtures'
 *
 *   test('my test', async ({ authenticatedPage }) => {
 *     // Page is already logged in
 *     await authenticatedPage.goto('/backend/users')
 *   })
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await loginAs(page, TEST_USERS.user.email, TEST_USERS.user.password)
    await use(page)
  },

  adminPage: async ({ page }, use) => {
    await loginAs(page, TEST_USERS.admin.email, TEST_USERS.admin.password)
    await use(page)
  },
})

export { expect }
