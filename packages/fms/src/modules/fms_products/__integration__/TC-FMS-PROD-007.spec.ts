import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist } from './helpers'

/**
 * TC-FMS-PROD-007: Perspectives — Save a Filtered & Sorted View as a Tab
 *
 * Verifies the full perspective workflow as a user would experience it:
 *  1. Click "+" to open Configure View panel
 *  2. Add a filter (chargeUnit = container)
 *  3. Add a sort rule (name descending)
 *  4. Save as a named perspective
 *  5. Verify the new tab appears and filters/sorts data correctly
 *  6. Switch to "All" tab to verify unfiltered view
 *  7. Switch back to the saved perspective to confirm it re-applies
 *  8. Delete the perspective tab
 */
test.describe('TC-FMS-PROD-007: Perspectives — Filtered & Sorted Tabs', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []
  const timestamp = Date.now()

  const testProducts = [
    { name: `ZZZ-Persp-${timestamp}`, chargeUnit: 'container' as const, transportMode: 'sea' as const },
    { name: `AAA-Persp-${timestamp}`, chargeUnit: 'container' as const, transportMode: 'rail' as const },
    { name: `MMM-Persp-${timestamp}`, chargeUnit: 'file' as const, transportMode: 'air' as const },
  ]

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')

    for (const input of testProducts) {
      const product = await createProductFixture(request, authToken, input)
      if (product) createdProductIds.push(product.id)
    }
    expect(createdProductIds).toHaveLength(3)
  })

  test.afterAll(async ({ request }) => {
    await deleteProductsIfExist(request, authToken, createdProductIds)
  })

  test('should create a perspective with filter + sort, switch tabs, then delete it', async ({
    page,
  }) => {
    test.setTimeout(90_000)

    const perspectiveName = `Sea Containers-${timestamp}`

    await login(page, 'admin')
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Search to isolate test data
    const searchInput = page.locator('.search-input')
    await searchInput.fill(`Persp-${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    // Verify all three products visible in "All" tab
    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }

    // ---- Step 1: Click "+" tab to open Configure View ----
    const addTab = page.locator('.hot-top-tab-add')
    await addTab.click()

    const configPanel = page.locator('.hot-config-panel')
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // ---- Step 2: Add a filter — chargeUnit contains "container" ----
    const filterSectionHeader = configPanel.locator('.hot-config-section-header').nth(1)
    await filterSectionHeader.click()
    await page.waitForTimeout(300)

    // Click "+ Add condition"
    const addFilterBtn = configPanel.locator('.hot-config-add-btn').first()
    await addFilterBtn.click()
    await page.waitForTimeout(300)

    // Change the field select to "chargeUnit"
    const fieldSelect = configPanel.locator('.hot-config-filter-select').first()
    await fieldSelect.selectOption('chargeUnit')

    // Enter value "container"
    const filterInput = configPanel.locator('.hot-config-filter-input').first()
    await expect(filterInput).toBeVisible({ timeout: 3_000 })
    await filterInput.fill('container')
    await filterInput.press('Enter')
    await page.waitForTimeout(500)

    // ---- Step 3: Add a sort rule — name descending ----
    const sortSectionHeader = configPanel.locator('.hot-config-section-header').nth(2)
    await sortSectionHeader.click()
    await page.waitForTimeout(300)

    // Click "+ Add sort"
    const addSortBtn = configPanel.locator('.hot-config-sorting .hot-config-add-btn')
    await addSortBtn.click()
    await page.waitForTimeout(300)

    // Field defaults to first column (name) — change direction to desc
    const directionSelect = configPanel.locator('.hot-config-sort-direction-select').first()
    await directionSelect.selectOption('desc')
    await page.waitForTimeout(500)

    // ---- Step 4: Save as a named perspective ----
    const saveViewBtn = configPanel.locator('.hot-config-save-btn')
    await saveViewBtn.click()
    await page.waitForTimeout(300)

    // The save form should appear — enter perspective name
    const nameInput = configPanel.locator('.hot-config-save-input')
    await expect(nameInput).toBeVisible({ timeout: 3_000 })
    await nameInput.fill(perspectiveName)

    // Click Save
    const saveBtn = configPanel.locator('.hot-config-save-btn')
    await saveBtn.click()
    await page.waitForTimeout(800)

    // Panel should close
    await expect(configPanel).toBeHidden({ timeout: 5_000 })

    // ---- Step 5: Verify the new tab appears ----
    const perspectiveTab = page.locator('.hot-top-tab').filter({ hasText: perspectiveName })
    await expect(perspectiveTab).toBeVisible({ timeout: 5_000 })

    // Data should now be filtered (only container products) and sorted desc
    await page.waitForTimeout(800)

    // Only ZZZ and AAA should be visible (chargeUnit=container), not MMM (chargeUnit=file)
    await expect(page.getByText(`ZZZ-Persp-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`AAA-Persp-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`MMM-Persp-${timestamp}`)).toBeHidden()

    // Verify sort order: ZZZ should appear before AAA (desc)
    const cells = page.locator('.hot-cell')
    const cellTexts = await cells.allInnerTexts()
    const zzzIdx = cellTexts.findIndex((t) => t.includes(`ZZZ-Persp-${timestamp}`))
    const aaaIdx = cellTexts.findIndex((t) => t.includes(`AAA-Persp-${timestamp}`))
    expect(zzzIdx).toBeGreaterThanOrEqual(0)
    expect(aaaIdx).toBeGreaterThanOrEqual(0)
    expect(zzzIdx).toBeLessThan(aaaIdx)

    // ---- Step 6: Switch to "All" tab — unfiltered view ----
    const allTab = page.locator('.hot-top-tab').filter({ hasText: 'All' })
    await allTab.click()
    await page.waitForTimeout(800)

    // All three products should be visible again
    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }

    // ---- Step 7: Switch back to saved perspective ----
    await perspectiveTab.click()
    await page.waitForTimeout(800)

    // Filter and sort should re-apply
    await expect(page.getByText(`ZZZ-Persp-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`AAA-Persp-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`MMM-Persp-${timestamp}`)).toBeHidden()

    // ---- Step 8: Delete the perspective tab ----
    const closeBtn = page.locator('.hot-top-tab-wrapper')
      .filter({ hasText: perspectiveName })
      .locator('.hot-top-tab-close')
    await closeBtn.click()
    await page.waitForTimeout(500)

    // Tab should be gone
    await expect(perspectiveTab).toBeHidden({ timeout: 3_000 })

    // Should fall back to "All" tab — all products visible
    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }
  })
})
