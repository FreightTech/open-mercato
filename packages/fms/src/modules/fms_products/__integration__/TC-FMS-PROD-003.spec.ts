import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist } from './helpers'

/**
 * TC-FMS-PROD-003: Filtering via Column Header Menu + ConfigureViewPanel
 *
 * Verifies that clicking a column header and selecting "Filter by this field"
 * opens the configure panel, where a filter can be added and applied.
 */
test.describe('TC-FMS-PROD-003: Filtering via Column Header Menu', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []
  const timestamp = Date.now()

  const testProducts = [
    { name: `FilterSea-${timestamp}`, chargeUnit: 'container' as const, transportMode: 'sea' as const },
    { name: `FilterAir-${timestamp}`, chargeUnit: 'file' as const, transportMode: 'air' as const },
    { name: `FilterRail-${timestamp}`, chargeUnit: 'weight_measure' as const, transportMode: 'rail' as const },
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

  test('should filter products by chargeUnit via column header menu', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'admin')

    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Search to isolate test data
    const searchInput = page.locator('.search-input')
    await expect(searchInput).toBeVisible({ timeout: 5_000 })
    await searchInput.fill(`Filter`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    // Verify all three test products are visible
    await expect(page.getByText(`FilterSea-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`FilterAir-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`FilterRail-${timestamp}`)).toBeVisible({ timeout: 5_000 })

    // Double-click the "Charge Unit" column header to open the column menu (modern layout)
    const chargeUnitHeader = page.locator('.hot-col-header').filter({ hasText: 'Charge Unit' })
    await chargeUnitHeader.dblclick()

    // Click "Filter by this field" in the column header menu
    const filterMenuItem = page.locator('.hot-col-menu-item').filter({ hasText: 'Filter by this field' })
    await expect(filterMenuItem).toBeVisible({ timeout: 3_000 })
    await filterMenuItem.click()

    // ConfigureViewPanel should open with filter section expanded
    const configPanel = page.locator('.hot-config-panel')
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // A filter row should already be added for chargeUnit field
    // Change the operator to "is_any_of" (or the default operator)
    // and set value to "container"
    const filterInput = configPanel.locator('.hot-config-filter-input').first()
    await expect(filterInput).toBeVisible({ timeout: 3_000 })
    await filterInput.fill('container')
    await filterInput.press('Enter')

    // Close the config panel
    const cancelButton = configPanel.locator('.hot-config-cancel-btn')
    await cancelButton.click()
    await expect(configPanel).toBeHidden({ timeout: 3_000 })

    // Wait for filter to apply
    await page.waitForTimeout(800)

    // Verify only FilterSea (chargeUnit=container) is visible
    await expect(page.getByText(`FilterSea-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`FilterAir-${timestamp}`)).toBeHidden()
    await expect(page.getByText(`FilterRail-${timestamp}`)).toBeHidden()

    // Clear the filter: click "+" tab to open config panel, remove the filter
    const addPerspectiveTab = page.locator('.hot-top-tab-add')
    await addPerspectiveTab.click()
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // Ensure the filter section is expanded (state persists in the Sheet,
    // so it may already be open from the initial "Filter by this field" action)
    const filterSection = configPanel.locator('.hot-config-section').nth(1)
    const isAlreadyOpen = await filterSection.evaluate(
      (el) => el.classList.contains('is-open')
    )
    if (!isAlreadyOpen) {
      await filterSection.locator('.hot-config-section-header').click()
      await page.waitForTimeout(300)
    }

    // Remove the filter row
    const removeFilterButton = configPanel.locator('.hot-config-filter-remove').first()
    await expect(removeFilterButton).toBeVisible({ timeout: 5_000 })
    await removeFilterButton.click()

    // Close config panel
    await configPanel.locator('.hot-config-cancel-btn').click()
    await expect(configPanel).toBeHidden({ timeout: 3_000 })

    // Wait for data to reload
    await page.waitForTimeout(800)

    // Verify all three products are visible again
    await expect(page.getByText(`FilterSea-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`FilterAir-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`FilterRail-${timestamp}`)).toBeVisible({ timeout: 5_000 })
  })
})
