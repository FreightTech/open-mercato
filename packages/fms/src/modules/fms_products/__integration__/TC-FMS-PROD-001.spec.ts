import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist, listProducts } from './helpers'

/**
 * TC-FMS-PROD-001: Product CRUD via DynamicTable
 *
 * Verifies adding a product via the "+" button, verifying it appears in the table,
 * and deleting it via the trash icon and confirmation dialog.
 */
test.describe('TC-FMS-PROD-001: Product CRUD via DynamicTable', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')
  })

  test.afterAll(async ({ request }) => {
    await deleteProductsIfExist(request, authToken, createdProductIds)
  })

  test('should add a product via + button, verify it appears, then delete it', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)

    await login(page, 'admin')

    // Navigate to FMS Products page
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    const timestamp = Date.now()
    const productName = `QA-PROD-001-${timestamp}`

    // Click "+" button to add new row
    const addRowButton = page.locator('button[title="Add new row"]')
    await expect(addRowButton).toBeVisible({ timeout: 5_000 })
    await addRowButton.click()

    // Wait for cell editor to appear and type the product name
    const cellEditor = page.locator('textarea.hot-cell-editor').first()
    await expect(cellEditor).toBeVisible({ timeout: 5_000 })
    await cellEditor.fill(productName)

    // Press Escape to commit the cell value without moving to next cell
    await cellEditor.press('Escape')

    // Click the "Save" button on the new row to persist it
    const saveButton = page.getByRole('button', { name: 'Save' })
    await expect(saveButton).toBeVisible({ timeout: 5_000 })
    await saveButton.click()

    // Wait for the row to be saved (Save button disappears after save)
    await expect(saveButton).toBeHidden({ timeout: 10_000 })

    // Verify the product appears in the table
    await expect(page.getByText(productName)).toBeVisible({ timeout: 10_000 })

    // Capture product ID via API for cleanup
    const { items } = await listProducts(request, authToken!, { q: productName })
    const createdProduct = items.find((item) => item.name === productName)
    expect(createdProduct).toBeTruthy()
    createdProductIds.push(createdProduct!.id)

    // Click the trash icon on the created product's row
    const productRow = page.locator('tr, .hot-row').filter({ hasText: productName })
    const deleteButton = productRow.locator('button[title="Delete Product"]')
    await expect(deleteButton).toBeVisible({ timeout: 5_000 })
    await deleteButton.click()

    // Confirm delete in dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByText(productName)).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete' }).click()

    // Wait for dialog to close and verify product is removed
    await expect(dialog).toBeHidden({ timeout: 10_000 })
    await page.waitForTimeout(1000)
    await expect(page.getByText(productName)).toBeHidden({ timeout: 5_000 })

    // Remove from cleanup list since UI delete succeeded
    const idx = createdProductIds.indexOf(createdProduct!.id)
    if (idx !== -1) createdProductIds.splice(idx, 1)
  })
})
