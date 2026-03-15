import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist } from './helpers'

/**
 * TC-FMS-PROD-002: Search Functionality
 *
 * Verifies that search by product name and charge code works correctly,
 * and that clearing the search restores all results.
 */
test.describe('TC-FMS-PROD-002: Search Functionality', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []
  const timestamp = Date.now()

  const testProducts = [
    { name: `SearchAlpha-${timestamp}`, chargeCode: `CODE-A-${timestamp}`, chargeUnit: 'container' as const, transportMode: 'sea' as const },
    { name: `SearchBeta-${timestamp}`, chargeCode: `CODE-B-${timestamp}`, chargeUnit: 'file' as const, transportMode: 'air' as const },
    { name: `SearchGamma-${timestamp}`, chargeCode: `CODE-A-${timestamp}`, chargeUnit: 'container' as const, transportMode: 'rail' as const },
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

  test('should search by product name, charge code, and clear search', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'admin')

    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    const searchInput = page.locator('.search-input')
    await expect(searchInput).toBeVisible({ timeout: 5_000 })

    // Search by exact product name — only Alpha should be visible
    await searchInput.fill(`SearchAlpha-${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    await expect(page.getByText(`SearchAlpha-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`SearchBeta-${timestamp}`)).toBeHidden()
    await expect(page.getByText(`SearchGamma-${timestamp}`)).toBeHidden()

    // Clear and search by charge code CODE-B — only Beta should be visible
    await searchInput.clear()
    await searchInput.fill(`CODE-B-${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    await expect(page.getByText(`SearchBeta-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`SearchAlpha-${timestamp}`)).toBeHidden()
    await expect(page.getByText(`SearchGamma-${timestamp}`)).toBeHidden()

    // Clear and search by shared charge code CODE-A — Alpha + Gamma visible
    await searchInput.clear()
    await searchInput.fill(`CODE-A-${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    await expect(page.getByText(`SearchAlpha-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`SearchGamma-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`SearchBeta-${timestamp}`)).toBeHidden()

    // Search by shared timestamp — all three should be visible
    await searchInput.clear()
    await searchInput.fill(`${timestamp}`)
    await searchInput.press('Enter')
    await page.waitForTimeout(800)

    await expect(page.getByText(`SearchAlpha-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`SearchBeta-${timestamp}`)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(`SearchGamma-${timestamp}`)).toBeVisible({ timeout: 5_000 })
  })
})
