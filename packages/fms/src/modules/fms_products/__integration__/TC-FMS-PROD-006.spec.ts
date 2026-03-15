import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist, listProducts } from './helpers'

/**
 * TC-FMS-PROD-006: Append Suffix to Existing Product Name
 *
 * A real user often wants to tweak an existing name — not retype it from scratch.
 * This test verifies the natural flow: double-click a name cell, move cursor to
 * the end, type a suffix, save, and confirm the full name persists.
 */
test.describe('TC-FMS-PROD-006: Append Suffix to Product Name', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
  })

  test.afterAll(async ({ request }) => {
    await deleteProductsIfExist(request, authToken, createdProductIds)
  })

  test('should append a suffix to an existing product name', async ({ page, request }) => {
    test.setTimeout(60_000)

    const timestamp = Date.now()
    const baseName = `Ocean Freight-${timestamp}`
    const suffix = ' Express'
    const expectedName = `${baseName}${suffix}`

    // Create a product via API
    const product = await createProductFixture(request, authToken!, {
      name: baseName,
      chargeUnit: 'container',
      transportMode: 'sea',
    })
    expect(product).toBeTruthy()
    createdProductIds.push(product!.id)

    await login(page, 'admin')
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Search to find our product
    const searchInput = page.locator('.search-input')
    await searchInput.fill(baseName)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)
    await expect(page.getByText(baseName)).toBeVisible({ timeout: 5_000 })

    // Double-click the name cell to enter edit mode
    const nameCell = page.locator('.hot-cell').filter({ hasText: baseName })
    await nameCell.dblclick()

    // Editor should appear with the current name
    const cellEditor = page.locator('textarea.hot-cell-editor').first()
    await expect(cellEditor).toBeVisible({ timeout: 5_000 })
    await expect(cellEditor).toHaveValue(baseName)

    // Move cursor to the end and type the suffix (like a real user would)
    await cellEditor.press('End')
    await cellEditor.pressSequentially(suffix)

    // Verify the editor now contains the full expected name
    await expect(cellEditor).toHaveValue(expectedName)

    // Press Enter to save
    await cellEditor.press('Enter')
    await page.waitForTimeout(1500)

    // Update the search to find the renamed product
    await searchInput.clear()
    await searchInput.fill(expectedName)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    // Verify the full name appears in the table
    await expect(page.getByText(expectedName)).toBeVisible({ timeout: 5_000 })

    // Verify via API that the full name was saved correctly
    const { items } = await listProducts(request, authToken!, { q: expectedName })
    const updated = items.find((item) => item.name === expectedName)
    expect(updated).toBeTruthy()
  })
})
