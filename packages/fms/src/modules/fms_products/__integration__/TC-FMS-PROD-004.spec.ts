import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist } from './helpers'

/**
 * TC-FMS-PROD-004: Sorting via Column Header Menu
 *
 * Verifies that clicking a column header and selecting "Sort A → Z" or
 * "Sort Z → A" correctly orders the table rows.
 */
test.describe('TC-FMS-PROD-004: Sorting via Column Header Menu', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []
  const timestamp = Date.now()

  const testProducts = [
    { name: `AAA-Sort-${timestamp}` },
    { name: `MMM-Sort-${timestamp}` },
    { name: `ZZZ-Sort-${timestamp}` },
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

  test('should sort products by name ascending and descending', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'admin')

    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Search to isolate test data
    const searchInput = page.locator('.search-input')
    await expect(searchInput).toBeVisible({ timeout: 5_000 })
    await searchInput.fill(`Sort-${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    // Verify all three test products are visible
    await expect(page.getByText(`AAA-Sort-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`MMM-Sort-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`ZZZ-Sort-${timestamp}`)).toBeVisible({ timeout: 5_000 })

    // Default sort is name ASC — verify AAA appears before ZZZ
    const allCells = page.locator('.hot-cell')
    const cellTexts = await allCells.allInnerTexts()
    const aaaIndex = cellTexts.findIndex((t) => t.includes(`AAA-Sort-${timestamp}`))
    const zzzIndex = cellTexts.findIndex((t) => t.includes(`ZZZ-Sort-${timestamp}`))
    expect(aaaIndex).toBeGreaterThanOrEqual(0)
    expect(zzzIndex).toBeGreaterThanOrEqual(0)
    expect(aaaIndex).toBeLessThan(zzzIndex)

    // Double-click the "Product Name" column header to open the column menu (modern layout)
    const nameHeader = page.locator('.hot-col-header').filter({ hasText: 'Product Name' })
    await nameHeader.dblclick()

    // Click "Sort Z → A" to sort descending
    const sortDescItem = page.locator('.hot-col-menu-item').filter({ hasText: 'Sort Z → A' })
    await expect(sortDescItem).toBeVisible({ timeout: 3_000 })
    await sortDescItem.click()

    // Wait for data to reload
    await page.waitForTimeout(800)

    // Verify ZZZ now appears before AAA (sort applied descending)
    const cellTextsDesc = await allCells.allInnerTexts()
    const aaaIndexDesc = cellTextsDesc.findIndex((t) => t.includes(`AAA-Sort-${timestamp}`))
    const zzzIndexDesc = cellTextsDesc.findIndex((t) => t.includes(`ZZZ-Sort-${timestamp}`))
    expect(zzzIndexDesc).toBeGreaterThanOrEqual(0)
    expect(aaaIndexDesc).toBeGreaterThanOrEqual(0)
    expect(zzzIndexDesc).toBeLessThan(aaaIndexDesc)
  })
})
