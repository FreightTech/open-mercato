import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist } from './helpers'

/**
 * TC-FMS-PROD-009: Multiple Perspectives (12 tabs)
 *
 * A power user might create many saved views. This test verifies that:
 *  1. 12 perspectives can be created, each with a unique filter
 *  2. All tabs render and are clickable
 *  3. Switching between tabs applies the correct filter
 *  4. Deleting all perspective tabs works and falls back to "All"
 */
test.describe('TC-FMS-PROD-009: Multiple Perspectives', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []
  const timestamp = Date.now()

  // Create 12 products
  const testProducts = Array.from({ length: 12 }, (_, i) => ({
    name: `MP-${String(i + 1).padStart(2, '0')}-${timestamp}`,
    chargeUnit: (['container', 'file', 'weight_measure', 'cargo_value_percent'] as const)[i % 4],
    transportMode: (['sea', 'air', 'rail'] as const)[i % 3],
  }))

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')

    for (const input of testProducts) {
      const product = await createProductFixture(request, authToken, input)
      if (product) createdProductIds.push(product!.id)
    }
    expect(createdProductIds).toHaveLength(12)
  })

  test.afterAll(async ({ request }) => {
    await deleteProductsIfExist(request, authToken, createdProductIds)
  })

  /**
   * Helper: create a perspective via the ConfigureViewPanel.
   * Ensures clean state by always starting from "All" tab with panel closed.
   */
  async function createPerspective(
    page: import('@playwright/test').Page,
    name: string,
    filterValue: string,
  ) {
    const configPanel = page.locator('.hot-config-panel')

    // Start from "All" tab to get clean filter state
    await page.locator('.hot-top-tab').filter({ hasText: 'All' }).click()
    await page.waitForTimeout(200)

    // Open config panel
    await page.locator('.hot-top-tab-add').click()
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // Expand filter section if needed
    const filterSection = configPanel.locator('.hot-config-section').nth(1)
    const isOpen = await filterSection.evaluate((el) => el.classList.contains('is-open'))
    if (!isOpen) {
      await filterSection.locator('.hot-config-section-header').click()
      await page.waitForTimeout(200)
    }

    // Clear any leftover filters
    while (await configPanel.locator('.hot-config-filter-remove').first().isVisible().catch(() => false)) {
      await configPanel.locator('.hot-config-filter-remove').first().click()
      await page.waitForTimeout(100)
    }

    // Add filter
    await configPanel.locator('.hot-config-filters .hot-config-add-btn').click()
    await page.waitForTimeout(200)

    const filterInput = configPanel.locator('.hot-config-filter-input').first()
    await filterInput.fill(filterValue)
    await filterInput.press('Enter')
    await page.waitForTimeout(200)

    // Show the save form — it may already be visible if the panel state persisted
    const nameInput = configPanel.locator('.hot-config-save-input')
    if (!await nameInput.isVisible().catch(() => false)) {
      await configPanel.getByRole('button', { name: 'Save as new view' }).click()
      await page.waitForTimeout(200)
    }

    // Fill name and click Save
    await expect(nameInput).toBeVisible({ timeout: 3_000 })
    await nameInput.fill(name)

    await configPanel.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(configPanel).toBeHidden({ timeout: 5_000 })
  }

  test('should create 12 perspectives, switch between them, then delete all', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await login(page, 'admin')
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Isolate test data via search — use the full timestamp to avoid cross-run matches
    const searchInput = page.locator('.search-input')
    await searchInput.fill(`${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    // ---- Create 12 perspectives ----
    const perspectiveNames: string[] = []

    for (let i = 0; i < 12; i++) {
      const perspName = `View-${i + 1}-${timestamp}`
      const targetNumber = String(i + 1).padStart(2, '0')
      perspectiveNames.push(perspName)

      // Filter by product number + timestamp to be specific to this run
      await createPerspective(page, perspName, `MP-${targetNumber}-${timestamp}`)
    }

    // ---- Verify all 12 tabs exist ----
    for (const name of perspectiveNames) {
      const tab = page.locator('.hot-top-tab').filter({ hasText: name })
      await expect(tab).toBeAttached({ timeout: 3_000 })
    }

    // "All" tab should still be there
    await expect(page.locator('.hot-top-tab').filter({ hasText: 'All' })).toBeVisible()

    // ---- Switch to 1st perspective — should show only MP-01 ----
    await page.locator('.hot-top-tab').filter({ hasText: perspectiveNames[0] }).click()
    await page.waitForTimeout(800)

    await expect(page.getByText(`MP-01-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`MP-02-${timestamp}`)).toBeHidden()

    // ---- Switch to 7th perspective — should show only MP-07 ----
    await page.locator('.hot-top-tab').filter({ hasText: perspectiveNames[6] }).click()
    await page.waitForTimeout(800)

    await expect(page.getByText(`MP-07-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`MP-01-${timestamp}`)).toBeHidden()

    // ---- Switch to 12th perspective — should show only MP-12 ----
    await page.locator('.hot-top-tab').filter({ hasText: perspectiveNames[11] }).click()
    await page.waitForTimeout(800)

    await expect(page.getByText(`MP-12-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`MP-07-${timestamp}`)).toBeHidden()

    // ---- Switch to "All" — all 12 products visible ----
    await page.locator('.hot-top-tab').filter({ hasText: 'All' }).click()
    await page.waitForTimeout(800)

    // Re-enter the search to ensure it's applied on the "All" view
    await searchInput.clear()
    await searchInput.fill(`${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }

    // ---- Delete all 12 perspective tabs ----
    // The close "×" button only appears on hover and tabs may overflow.
    // Click the tab first to activate it, then hover and click close.
    for (const name of perspectiveNames) {
      const tab = page.locator('.hot-top-tab').filter({ hasText: name })
      if (await tab.count() === 0) continue

      // Click the tab to make it active (ensures it's scrolled into view)
      await tab.first().click()
      await page.waitForTimeout(200)

      // Hover the wrapper to reveal the close button, then click it
      const wrapper = page.locator('.hot-top-tab-wrapper').filter({ hasText: name })
      await wrapper.first().hover()
      await wrapper.locator('.hot-top-tab-close').first().click({ force: true })
      await page.waitForTimeout(200)
    }

    // No perspective tabs should remain
    for (const name of perspectiveNames) {
      await expect(
        page.locator('.hot-top-tab').filter({ hasText: name })
      ).toBeHidden({ timeout: 2_000 })
    }

    // All products still visible
    await searchInput.clear()
    await searchInput.fill(`${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }
  })
})
