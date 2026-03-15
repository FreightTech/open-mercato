import { test, expect } from '@playwright/test'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { createProductFixture, deleteProductsIfExist } from './helpers'

/**
 * TC-FMS-PROD-008: Column Visibility and Reordering
 *
 * Verifies that a user can:
 *  1. Hide a column via the column header menu ("Hide field")
 *  2. Confirm the column disappears from the table
 *  3. Re-show it via ConfigureViewPanel's "Hide fields" section
 *  4. Use "Hide all" / "Show all" bulk actions
 *  5. Save a perspective with hidden columns, switch to All, switch back
 */
test.describe('TC-FMS-PROD-008: Column Visibility and Reordering', () => {
  let authToken: string | null = null
  const createdProductIds: string[] = []
  const timestamp = Date.now()

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'admin')

    const product = await createProductFixture(request, authToken, {
      name: `ColTest-${timestamp}`,
      chargeCode: `CC-${timestamp}`,
      chargeUnit: 'container',
      transportMode: 'sea',
    })
    expect(product).toBeTruthy()
    createdProductIds.push(product!.id)
  })

  test.afterAll(async ({ request }) => {
    await deleteProductsIfExist(request, authToken, createdProductIds)
  })

  test('should hide a column via header menu, then restore it via config panel', async ({
    page,
  }) => {
    test.setTimeout(60_000)

    await login(page, 'admin')
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Verify all columns are initially visible
    const headers = page.locator('.hot-col-header')
    await expect(headers.filter({ hasText: 'Product Name' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Charge Code' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Charge Unit' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Transport Mode' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Active' })).toBeVisible()

    // ---- Hide "Transport Mode" via column header menu ----
    const transportHeader = headers.filter({ hasText: 'Transport Mode' })
    await transportHeader.dblclick()

    const hideMenuItem = page.locator('.hot-col-menu-item').filter({ hasText: 'Hide field' })
    await expect(hideMenuItem).toBeVisible({ timeout: 3_000 })
    await hideMenuItem.click()
    await page.waitForTimeout(500)

    // Verify "Transport Mode" column is gone
    await expect(headers.filter({ hasText: 'Transport Mode' })).toBeHidden({ timeout: 3_000 })

    // Other columns should still be visible
    await expect(headers.filter({ hasText: 'Product Name' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Charge Code' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Charge Unit' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Active' })).toBeVisible()

    // ---- Restore "Transport Mode" via ConfigureViewPanel ----
    const addTab = page.locator('.hot-top-tab-add')
    await addTab.click()

    const configPanel = page.locator('.hot-config-panel')
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // Expand "Hide fields" section (the first one)
    const fieldsSectionHeader = configPanel.locator('.hot-config-section-header').nth(0)
    // Check if already open
    const fieldsSection = configPanel.locator('.hot-config-section').nth(0)
    const isFieldsOpen = await fieldsSection.evaluate(
      (el) => el.classList.contains('is-open')
    )
    if (!isFieldsOpen) {
      await fieldsSectionHeader.click()
      await page.waitForTimeout(300)
    }

    // The badge should show "4 of 5 visible" (one hidden)
    await expect(configPanel.getByText('4 of 5 visible')).toBeVisible({ timeout: 3_000 })

    // Find the "Transport Mode" checkbox and check it to make it visible again
    const transportLabel = configPanel.locator('.hot-config-fields-item').filter({ hasText: 'Transport Mode' })
    const transportCheckbox = transportLabel.locator('.hot-config-fields-checkbox')
    await expect(transportCheckbox).not.toBeChecked()
    await transportCheckbox.click()
    await page.waitForTimeout(300)

    // Badge should now show "5 of 5 visible"
    await expect(configPanel.getByText('5 of 5 visible')).toBeVisible({ timeout: 3_000 })

    // Close the config panel
    await configPanel.locator('.hot-config-cancel-btn').click()
    await expect(configPanel).toBeHidden({ timeout: 3_000 })

    // Verify "Transport Mode" is back in the table
    await expect(headers.filter({ hasText: 'Transport Mode' })).toBeVisible({ timeout: 3_000 })
  })

  test('should hide all columns then show all via config panel', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'admin')
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    // Open ConfigureViewPanel
    const addTab = page.locator('.hot-top-tab-add')
    await addTab.click()

    const configPanel = page.locator('.hot-config-panel')
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // Expand "Hide fields" section
    const fieldsSection = configPanel.locator('.hot-config-section').nth(0)
    const isFieldsOpen = await fieldsSection.evaluate(
      (el) => el.classList.contains('is-open')
    )
    if (!isFieldsOpen) {
      await fieldsSection.locator('.hot-config-section-header').click()
      await page.waitForTimeout(300)
    }

    // Click "Hide all"
    const hideAllBtn = configPanel.locator('.hot-config-fields-bulk-btn').filter({ hasText: 'Hide all' })
    await hideAllBtn.click()
    await page.waitForTimeout(300)

    // Badge should show "0 of 5 visible"
    await expect(configPanel.getByText('0 of 5 visible')).toBeVisible({ timeout: 3_000 })

    // Click "Show all"
    const showAllBtn = configPanel.locator('.hot-config-fields-bulk-btn').filter({ hasText: 'Show all' })
    await showAllBtn.click()
    await page.waitForTimeout(300)

    // Badge should show "5 of 5 visible"
    await expect(configPanel.getByText('5 of 5 visible')).toBeVisible({ timeout: 3_000 })

    // Close the config panel
    await configPanel.locator('.hot-config-cancel-btn').click()
    await expect(configPanel).toBeHidden({ timeout: 3_000 })

    // Verify all columns are visible
    const headers = page.locator('.hot-col-header')
    await expect(headers.filter({ hasText: 'Product Name' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Charge Code' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Charge Unit' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Transport Mode' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Active' })).toBeVisible()
  })

  test('should save a perspective with hidden columns and restore on tab switch', async ({
    page,
  }) => {
    test.setTimeout(90_000)

    const perspName = `Slim-${timestamp}`

    await login(page, 'admin')
    await page.goto('/backend/fms-products')
    await expect(
      page.getByRole('heading', { name: 'Products', level: 3 })
    ).toBeVisible({ timeout: 15_000 })

    const headers = page.locator('.hot-col-header')

    // ---- Hide two columns via header menu ----
    // Hide "Charge Code"
    await headers.filter({ hasText: 'Charge Code' }).dblclick()
    await page.locator('.hot-col-menu-item').filter({ hasText: 'Hide field' }).click()
    await page.waitForTimeout(400)

    // Hide "Transport Mode"
    await headers.filter({ hasText: 'Transport Mode' }).dblclick()
    await page.locator('.hot-col-menu-item').filter({ hasText: 'Hide field' }).click()
    await page.waitForTimeout(400)

    // Verify only 3 columns remain
    await expect(headers.filter({ hasText: 'Charge Code' })).toBeHidden()
    await expect(headers.filter({ hasText: 'Transport Mode' })).toBeHidden()
    await expect(headers.filter({ hasText: 'Product Name' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Charge Unit' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Active' })).toBeVisible()

    // ---- Save as perspective ----
    const addTab = page.locator('.hot-top-tab-add')
    await addTab.click()

    const configPanel = page.locator('.hot-config-panel')
    await expect(configPanel).toBeVisible({ timeout: 5_000 })

    // Click "Save as new view"
    await configPanel.locator('.hot-config-save-btn').click()
    await page.waitForTimeout(300)

    // Enter name and save
    const nameInput = configPanel.locator('.hot-config-save-input')
    await expect(nameInput).toBeVisible({ timeout: 3_000 })
    await nameInput.fill(perspName)
    await configPanel.locator('.hot-config-save-btn').click()
    await page.waitForTimeout(500)
    await expect(configPanel).toBeHidden({ timeout: 5_000 })

    // Verify the perspective tab appears
    const perspTab = page.locator('.hot-top-tab').filter({ hasText: perspName })
    await expect(perspTab).toBeVisible({ timeout: 5_000 })

    // ---- Switch to "All" tab — all 5 columns should return ----
    const allTab = page.locator('.hot-top-tab').filter({ hasText: 'All' })
    await allTab.click()
    await page.waitForTimeout(500)

    await expect(headers.filter({ hasText: 'Product Name' })).toBeVisible({ timeout: 3_000 })
    await expect(headers.filter({ hasText: 'Charge Code' })).toBeVisible({ timeout: 3_000 })
    await expect(headers.filter({ hasText: 'Charge Unit' })).toBeVisible({ timeout: 3_000 })
    await expect(headers.filter({ hasText: 'Transport Mode' })).toBeVisible({ timeout: 3_000 })
    await expect(headers.filter({ hasText: 'Active' })).toBeVisible({ timeout: 3_000 })

    // ---- Switch back to saved perspective — columns should hide again ----
    await perspTab.click()
    await page.waitForTimeout(500)

    await expect(headers.filter({ hasText: 'Charge Code' })).toBeHidden({ timeout: 3_000 })
    await expect(headers.filter({ hasText: 'Transport Mode' })).toBeHidden({ timeout: 3_000 })
    await expect(headers.filter({ hasText: 'Product Name' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Charge Unit' })).toBeVisible()
    await expect(headers.filter({ hasText: 'Active' })).toBeVisible()

    // ---- Clean up: delete the perspective tab ----
    const closeBtn = page.locator('.hot-top-tab-wrapper')
      .filter({ hasText: perspName })
      .locator('.hot-top-tab-close')
    await closeBtn.click()
    await page.waitForTimeout(500)
    await expect(perspTab).toBeHidden({ timeout: 3_000 })
  })
})
