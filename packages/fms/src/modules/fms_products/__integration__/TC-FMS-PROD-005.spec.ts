import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist, listProducts } from './helpers'

/**
 * TC-FMS-PROD-005: Inline Editing of Existing Products
 *
 * Verifies that a user can double-click a cell in the DynamicTable to edit it,
 * change the value, commit the edit, and see the change persist after reload.
 */
test.describe('TC-FMS-PROD-005: Inline Editing of Existing Products', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
  })

  test.afterAll(async ({ request }) => {
    await deleteProductsIfExist(request, authToken, createdProductIds)
  })

  test('should edit product name inline and persist after reload', async ({ page, request }) => {
    test.setTimeout(60_000)

    const timestamp = Date.now()
    const originalName = `EditName-${timestamp}`
    const updatedName = `EditName-Renamed-${timestamp}`

    // Create a product via API
    const product = await createProductFixture(request, authToken!, {
      name: originalName,
      chargeCode: `EN-${timestamp}`,
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

    // Search to find our test product
    const searchInput = page.locator('.search-input')
    await searchInput.fill(originalName)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 5_000 })

    // Double-click the product name cell to enter edit mode
    const nameCell = page.locator('.hot-cell').filter({ hasText: originalName })
    await nameCell.dblclick()

    // Editor should appear
    const cellEditor = page.locator('textarea.hot-cell-editor').first()
    await expect(cellEditor).toBeVisible({ timeout: 5_000 })

    // Clear and type the new name, then press Enter to save
    await cellEditor.fill(updatedName)
    await cellEditor.press('Enter')
    await page.waitForTimeout(1500)

    // The search still has the old name — clear it and search for the new name
    await searchInput.clear()
    await searchInput.fill(updatedName)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    // Verify the updated name appears in the table
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5_000 })

    // Verify via API that the change persisted
    const { items } = await listProducts(request, authToken!, { q: updatedName })
    const updatedProduct = items.find((item) => item.name === updatedName)
    expect(updatedProduct).toBeTruthy()

    // Reload page and verify the edit survives
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    await searchInput.fill(updatedName)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5_000 })
  })

  test('should edit chargeUnit dropdown inline', async ({ page, request }) => {
    test.setTimeout(60_000)

    const timestamp = Date.now()
    const productName = `EditDrop-${timestamp}`

    // Create a product with chargeUnit = container
    const product = await createProductFixture(request, authToken!, {
      name: productName,
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

    // Search to find our test product
    const searchInput = page.locator('.search-input')
    await searchInput.fill(productName)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    await expect(page.getByText(productName)).toBeVisible({ timeout: 5_000 })

    // The chargeUnit should currently show "Container" pill
    await expect(page.getByText('Container')).toBeVisible({ timeout: 5_000 })

    // Find the chargeUnit cell — it's the 3rd column (index 2) in the data row
    const chargeUnitCell = page.locator('.hot-cell[data-col="2"]').first()
    await chargeUnitCell.dblclick()

    // A dropdown editor should appear
    const cellEditor = page.locator('textarea.hot-cell-editor').first()
    await expect(cellEditor).toBeVisible({ timeout: 5_000 })

    // Type to filter and select "File"
    await cellEditor.fill('File')
    await page.waitForTimeout(300)

    // Click the "File" option in the dropdown popup
    const dropdownOption = page.locator('.hot-dropdown-option').filter({ hasText: 'File' })
    await expect(dropdownOption.first()).toBeVisible({ timeout: 3_000 })
    await dropdownOption.first().click()
    await page.waitForTimeout(1500)

    // Verify the cell now shows "File" pill
    await expect(page.locator('.hot-cell[data-col="2"]').first().getByText('File')).toBeVisible({ timeout: 5_000 })

    // Verify via API
    const { items } = await listProducts(request, authToken!, { q: productName })
    const updated = items.find((item) => item.name === productName)
    expect(updated).toBeTruthy()
    expect(updated!.chargeUnit).toBe('file')
  })
})
