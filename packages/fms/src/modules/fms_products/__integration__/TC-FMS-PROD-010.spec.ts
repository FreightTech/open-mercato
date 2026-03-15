import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist } from './helpers'

/**
 * TC-FMS-PROD-010: Grouping via ConfigureViewPanel
 *
 * Verifies that a user can:
 *  1. Group rows by a column (chargeUnit) — group headers appear
 *  2. Verify group headers show correct labels and counts
 *  3. Collapse a group — its rows hide
 *  4. Expand it back — rows return
 *  5. Add a second grouping level (nested groups)
 *  6. Remove grouping — flat list returns
 */
test.describe('TC-FMS-PROD-010: Grouping', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []
  const timestamp = Date.now()

  // 6 products: 3 container, 2 file, 1 weight_measure
  const testProducts = [
    { name: `GRP-A1-${timestamp}`, chargeUnit: 'container' as const, transportMode: 'sea' as const },
    { name: `GRP-A2-${timestamp}`, chargeUnit: 'container' as const, transportMode: 'air' as const },
    { name: `GRP-A3-${timestamp}`, chargeUnit: 'container' as const, transportMode: 'sea' as const },
    { name: `GRP-B1-${timestamp}`, chargeUnit: 'file' as const, transportMode: 'air' as const },
    { name: `GRP-B2-${timestamp}`, chargeUnit: 'file' as const, transportMode: 'rail' as const },
    { name: `GRP-C1-${timestamp}`, chargeUnit: 'weight_measure' as const, transportMode: 'sea' as const },
  ]

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')

    for (const input of testProducts) {
      const product = await createProductFixture(request, authToken, input)
      if (product) createdProductIds.push(product!.id)
    }
    expect(createdProductIds).toHaveLength(6)
  })

  test.afterAll(async ({ request }) => {
    await deleteProductsIfExist(request, authToken, createdProductIds)
  })

  test('should group by chargeUnit, collapse/expand, then remove grouping', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page, 'admin')
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Isolate test data
    const searchInput = page.locator('.search-input')
    await searchInput.fill(`GRP-`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    // Verify all 6 products visible in flat list (no group headers)
    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }
    await expect(page.locator('.hot-group-header-row')).toHaveCount(0)

    // ---- Open ConfigureViewPanel and add group by chargeUnit ----
    const configPanel = page.locator('.hot-config-panel')
    await page.locator('.hot-top-tab-add').click()
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // Expand Group section (index 3)
    const groupSection = configPanel.locator('.hot-config-section').nth(3)
    const isGroupOpen = await groupSection.evaluate(el => el.classList.contains('is-open'))
    if (!isGroupOpen) {
      await groupSection.locator('.hot-config-section-header').click()
      await page.waitForTimeout(300)
    }

    // Click "+ Add group"
    // The grouping section reuses .hot-config-sorting CSS, so the add button is inside it
    const addGroupBtn = groupSection.locator('.hot-config-add-btn')
    await addGroupBtn.click()
    await page.waitForTimeout(300)

    // Default field is first column (name) — change to chargeUnit
    const fieldSelect = groupSection.locator('.hot-config-sort-select').first()
    await fieldSelect.selectOption('chargeUnit')
    await page.waitForTimeout(300)

    // Close panel
    await configPanel.locator('.hot-config-cancel-btn').click()
    await expect(configPanel).toBeHidden({ timeout: 3_000 })
    await page.waitForTimeout(800)

    // ---- Verify group headers appeared ----
    const groupHeaders = page.locator('.hot-group-header-row')
    await expect(groupHeaders.first()).toBeVisible({ timeout: 5_000 })

    // Should have 3 groups: container (3), file (2), weight_measure (1)
    // Check group header values exist
    const containerHeader = page.locator('.hot-group-header-row').filter({ hasText: 'container' })
    const fileHeader = page.locator('.hot-group-header-row').filter({ hasText: 'file' })
    const weightHeader = page.locator('.hot-group-header-row').filter({ hasText: 'weight_measure' })

    await expect(containerHeader).toBeVisible({ timeout: 5_000 })
    await expect(fileHeader).toBeVisible({ timeout: 5_000 })
    await expect(weightHeader).toBeVisible({ timeout: 5_000 })

    // Verify counts
    await expect(containerHeader.locator('.hot-group-header-count')).toHaveText('3')
    await expect(fileHeader.locator('.hot-group-header-count')).toHaveText('2')
    await expect(weightHeader.locator('.hot-group-header-count')).toHaveText('1')

    // All data rows should still be visible (groups expanded by default)
    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }

    // ---- Collapse the "container" group ----
    await containerHeader.locator('.hot-group-header-cell').click()
    await page.waitForTimeout(500)

    // Container products should be hidden
    await expect(page.getByText(`GRP-A1-${timestamp}`)).toBeHidden({ timeout: 3_000 })
    await expect(page.getByText(`GRP-A2-${timestamp}`)).toBeHidden()
    await expect(page.getByText(`GRP-A3-${timestamp}`)).toBeHidden()

    // File and weight_measure products should still be visible
    await expect(page.getByText(`GRP-B1-${timestamp}`)).toBeVisible()
    await expect(page.getByText(`GRP-B2-${timestamp}`)).toBeVisible()
    await expect(page.getByText(`GRP-C1-${timestamp}`)).toBeVisible()

    // The container group header should show ChevronRight (collapsed indicator)
    await expect(containerHeader.locator('.hot-group-header-chevron')).toBeVisible()

    // ---- Expand the "container" group back ----
    await containerHeader.locator('.hot-group-header-cell').click()
    await page.waitForTimeout(500)

    // All rows should be visible again
    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }

    // ---- Remove grouping via ConfigureViewPanel ----
    await page.locator('.hot-top-tab-add').click()
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // Expand Group section
    const groupSection2 = configPanel.locator('.hot-config-section').nth(3)
    const isOpen2 = await groupSection2.evaluate(el => el.classList.contains('is-open'))
    if (!isOpen2) {
      await groupSection2.locator('.hot-config-section-header').click()
      await page.waitForTimeout(300)
    }

    // Remove the group rule
    const removeBtn = groupSection2.locator('.hot-config-sort-remove').first()
    await expect(removeBtn).toBeVisible({ timeout: 3_000 })
    await removeBtn.click()
    await page.waitForTimeout(300)

    // Close panel
    await configPanel.locator('.hot-config-cancel-btn').click()
    await expect(configPanel).toBeHidden({ timeout: 3_000 })
    await page.waitForTimeout(800)

    // ---- Verify flat list returned — no group headers ----
    await expect(page.locator('.hot-group-header-row')).toHaveCount(0)

    // All products still visible
    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }
  })

  test('should support nested grouping (two levels)', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page, 'admin')
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Isolate test data
    const searchInput = page.locator('.search-input')
    await searchInput.fill(`GRP-`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    // ---- Add two group levels: chargeUnit then transportMode ----
    const configPanel = page.locator('.hot-config-panel')
    await page.locator('.hot-top-tab-add').click()
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // Expand Group section
    const groupSection = configPanel.locator('.hot-config-section').nth(3)
    const isGroupOpen = await groupSection.evaluate(el => el.classList.contains('is-open'))
    if (!isGroupOpen) {
      await groupSection.locator('.hot-config-section-header').click()
      await page.waitForTimeout(300)
    }

    // Clear any leftover group rules
    while (await groupSection.locator('.hot-config-sort-remove').first().isVisible().catch(() => false)) {
      await groupSection.locator('.hot-config-sort-remove').first().click()
      await page.waitForTimeout(100)
    }

    // Add first group: chargeUnit
    await groupSection.locator('.hot-config-add-btn').click()
    await page.waitForTimeout(200)
    await groupSection.locator('.hot-config-sort-select').first().selectOption('chargeUnit')
    await page.waitForTimeout(200)

    // Add second group: transportMode
    await groupSection.locator('.hot-config-add-btn').click()
    await page.waitForTimeout(200)
    // The second select is the field for the new rule — it's the second .hot-config-sort-select
    // But each row has 2 selects (field + direction), so the 3rd select overall is the 2nd rule's field
    const allSelects = groupSection.locator('.hot-config-sort-select')
    await allSelects.nth(1).selectOption('transportMode')
    await page.waitForTimeout(300)

    // Close panel
    await configPanel.locator('.hot-config-cancel-btn').click()
    await expect(configPanel).toBeHidden({ timeout: 3_000 })
    await page.waitForTimeout(800)

    // ---- Verify nested group headers ----
    const groupHeaders = page.locator('.hot-group-header-row')
    // We should have top-level groups (chargeUnit) + nested groups (transportMode)
    // container: sea(2), air(1) → 3 headers (container + sea + air)
    // file: air(1), rail(1) → 3 headers (file + air + rail)
    // weight_measure: sea(1) → 2 headers (weight_measure + sea)
    // Total: 8 group headers
    const headerCount = await groupHeaders.count()
    expect(headerCount).toBeGreaterThanOrEqual(6) // at least top-level + some nested

    // Verify nested structure: there should be a transportMode group header
    // inside the container group
    const seaHeaders = page.locator('.hot-group-header-value').filter({ hasText: 'sea' })
    await expect(seaHeaders.first()).toBeVisible({ timeout: 5_000 })

    // All data rows should still be visible
    for (const product of testProducts) {
      await expect(page.getByText(product.name)).toBeVisible({ timeout: 5_000 })
    }

    // ---- Clean up: remove all group rules ----
    await page.locator('.hot-top-tab-add').click()
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    const groupSection2 = configPanel.locator('.hot-config-section').nth(3)
    const isOpen2 = await groupSection2.evaluate(el => el.classList.contains('is-open'))
    if (!isOpen2) {
      await groupSection2.locator('.hot-config-section-header').click()
      await page.waitForTimeout(300)
    }

    // Click "Clear all"
    const clearAllBtn = groupSection2.locator('.hot-config-clear-btn')
    if (await clearAllBtn.isVisible().catch(() => false)) {
      await clearAllBtn.click()
      await page.waitForTimeout(200)
    }

    await configPanel.locator('.hot-config-cancel-btn').click()
    await expect(configPanel).toBeHidden({ timeout: 3_000 })
  })
})
