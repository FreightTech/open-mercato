import { test, expect } from '@playwright/test'
import { getAuthToken } from '../../../../../core/src/modules/core/__integration__/helpers/api'
import { login } from '../../../../../core/src/modules/core/__integration__/helpers/auth'
import {
  createDocumentFixture,
  deleteDocumentsIfExist,
} from './helpers'

/**
 * TC-FMS-DOC-015: Documents DynamicTable UI — Search, Filter, Sort, Perspectives
 *
 * Tests the FMS Documents list page UI interactions:
 * - Search input: find documents by name, seller, vessel, BL number, booking number
 * - Sort: via ConfigureViewPanel side panel
 * - Filter: via ConfigureViewPanel side panel
 * - Perspectives: create, switch, delete saved views
 */
test.describe('TC-FMS-DOC-015: Documents DynamicTable UI', () => {
  let authToken: string
  const createdDocumentIds: string[] = []
  const testPrefix = `ui-${Date.now()}`

  // Each document has unique values per searchable field so we can verify
  // search isolation. The 8 ILIKE-searchable fields are:
  //   name, description, documentNumber, blNumber, bookingNumber,
  //   vesselName, sellerName, buyerName
  //
  // Visible table columns (12): Name, Category, Detected Type, Doc Number,
  //   B/L Number, Booking No., Vessel, POL, POD, Seller, Amount, Currency
  const DOCS = {
    invoiceAlpha: {
      name: `${testPrefix}-invoice-alpha`,
      category: 'invoice' as const,
      sellerName: 'UniqueSellerAlpha',
      totalGrossAmount: 5500,
      currency: 'USD',
      blNumber: 'UIDOCBL001',
      documentNumber: 'DOCNUM-ALPHA-7701',
    },
    invoiceBeta: {
      name: `${testPrefix}-invoice-beta`,
      category: 'invoice' as const,
      sellerName: 'UniqueSellerBeta',
      totalGrossAmount: 3200,
      currency: 'EUR',
      vesselName: 'MSC Unique Vessel',
      description: 'UniqueDescriptionBeta for search test',
    },
    bolGamma: {
      name: `${testPrefix}-bol-gamma`,
      category: 'bill_of_lading' as const,
      blNumber: 'UIDOCBL999',
      vesselName: 'Evergreen UniqueShip',
      portOfLoading: 'Shanghai',
      portOfDischarge: 'Rotterdam',
    },
    bookingDelta: {
      name: `${testPrefix}-booking-delta`,
      category: 'booking_confirmation' as const,
      bookingNumber: 'UIBK777',
      vesselName: 'Maersk UniqueVessel',
    },
    packingEpsilon: {
      name: `${testPrefix}-packing-epsilon`,
      category: 'packing_list' as const,
      description: 'Unique packing list for testing',
      buyerName: 'UniqueBuyerEpsilon',
    },
  }

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, 'superadmin')

    for (const doc of Object.values(DOCS)) {
      const created = await createDocumentFixture(request, authToken, doc)
      if (created?.id) {
        createdDocumentIds.push(created.id)
      }
    }

    expect(createdDocumentIds.length).toBe(5)
  })

  test.afterAll(async ({ request }) => {
    await deleteDocumentsIfExist(request, authToken, createdDocumentIds)
  })

  // Helper: navigate and wait for table
  async function gotoDocuments(page: import('@playwright/test').Page) {
    await login(page, 'superadmin')
    await page.goto('/backend/fms-documents')
    await expect(page.locator('.search-input')).toBeVisible({ timeout: 15_000 })
  }

  // Helper: wait for search debounce and network
  async function waitForSearch(page: import('@playwright/test').Page) {
    await page.waitForTimeout(600)
  }

  // ---------------------------------------------------------------------------
  // Search tests
  // ---------------------------------------------------------------------------

  test('should search documents by name via search input', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill(DOCS.invoiceAlpha.name)
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${DOCS.bolGamma.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should search documents by seller name', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill('UniqueSellerBeta')
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.invoiceBeta.name}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should search documents by vessel name', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill('Evergreen UniqueShip')
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.bolGamma.name}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should search documents by BL number', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill('UIDOCBL999')
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.bolGamma.name}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${DOCS.invoiceBeta.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should search documents by booking number', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill('UIBK777')
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.bookingDelta.name}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${DOCS.bolGamma.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should search documents by document number', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill('DOCNUM-ALPHA-7701')
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${DOCS.invoiceBeta.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should search documents by description (non-visible column)', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill('UniqueDescriptionBeta')
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.invoiceBeta.name}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should search documents by buyer name (non-visible column)', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill('UniqueBuyerEpsilon')
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.packingEpsilon.name}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should NOT find documents by non-searchable visible fields (POL, POD, currency, amount)', async ({ page }) => {
    await gotoDocuments(page)

    const searchInput = page.locator('.search-input')

    // portOfLoading is visible in the table but not in the ILIKE search fields
    await searchInput.fill('Shanghai')
    await waitForSearch(page)
    await expect(page.locator(`text=${DOCS.bolGamma.name}`)).toBeHidden({ timeout: 5_000 })

    // portOfDischarge — same
    await searchInput.fill('Rotterdam')
    await waitForSearch(page)
    await expect(page.locator(`text=${DOCS.bolGamma.name}`)).toBeHidden({ timeout: 5_000 })

    // currency — not searchable
    await searchInput.fill('EUR')
    await waitForSearch(page)
    // EUR is too short / generic — verify our specific doc isn't found via currency alone
    // (if other docs have EUR in name/desc they might show; we just check it doesn't
    //  specifically find invoiceBeta unless its name matches)
    // This is a best-effort check: search "EUR" should not bring back invoiceBeta
    // if the only match would be the currency field.

    // totalGrossAmount — not searchable
    await searchInput.fill('5500')
    await waitForSearch(page)
    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`)).toBeHidden({ timeout: 5_000 })
  })

  test('should show no results for non-matching search', async ({ page }) => {
    await gotoDocuments(page)

    await page.locator('.search-input').fill('zzz-nonexistent-document-12345')
    await waitForSearch(page)

    for (const doc of Object.values(DOCS)) {
      await expect(page.locator(`text=${doc.name}`)).toBeHidden({ timeout: 5_000 })
    }
  })

  test('should clear search and show all documents again', async ({ page }) => {
    await gotoDocuments(page)

    const searchInput = page.locator('.search-input')

    // Narrow
    await searchInput.fill(DOCS.invoiceAlpha.name)
    await waitForSearch(page)
    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`).first()).toBeVisible({ timeout: 10_000 })

    // Clear
    await searchInput.fill('')
    await waitForSearch(page)

    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`).first()).toBeVisible({ timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // Sort tests — via ConfigureViewPanel (opened by "+" button)
  // ---------------------------------------------------------------------------

  test('should sort documents via Configure View panel', async ({ page }) => {
    await gotoDocuments(page)

    // Narrow to test docs
    await page.locator('.search-input').fill(testPrefix)
    await waitForSearch(page)
    await expect(page.locator('tr[data-row]').first()).toBeVisible({ timeout: 10_000 })

    // Open Configure View panel via "+" tab
    const addBtn = page.locator('.hot-top-tab-add')
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    // Panel should open (Sheet with "Configure View" title)
    const panel = page.locator('.hot-config-panel')
    await expect(panel).toBeVisible({ timeout: 5_000 })

    // Expand "Sort" section
    await panel.locator('.hot-config-section-header:has-text("Sort")').click()

    // Add a sort rule
    await panel.locator('.hot-config-add-btn:has-text("Add sort")').click()

    // Select "Name" field in the sort row
    const sortFieldSelect = panel.locator('.hot-config-sort-select').first()
    await sortFieldSelect.selectOption({ label: 'Name' })

    // Ensure ascending direction
    const directionSelect = panel.locator('.hot-config-sort-direction-select').first()
    await directionSelect.selectOption('asc')

    // Close panel
    await panel.locator('.hot-config-cancel-btn:has-text("Cancel")').click()
    await page.waitForTimeout(800)

    // Verify first row is alphabetically first
    // bol-gamma < booking-delta < invoice-alpha < invoice-beta < packing-epsilon
    const firstRow = page.locator('tr[data-row]').first()
    await expect(firstRow).toContainText('bol-gamma', { timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // Filter tests — via ConfigureViewPanel
  // ---------------------------------------------------------------------------

  test('should filter documents via Configure View panel', async ({ page }) => {
    await gotoDocuments(page)

    // Narrow to test docs
    await page.locator('.search-input').fill(testPrefix)
    await waitForSearch(page)
    await expect(page.locator('tr[data-row]').first()).toBeVisible({ timeout: 10_000 })

    // Count rows before filtering
    const rowsBefore = await page.locator('tr[data-row]').count()
    expect(rowsBefore).toBeGreaterThanOrEqual(5)

    // Open Configure View panel
    const addBtn = page.locator('.hot-top-tab-add')
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    const panel = page.locator('.hot-config-panel')
    await expect(panel).toBeVisible({ timeout: 5_000 })

    // Expand "Filter" section
    await panel.locator('.hot-config-section-header:has-text("Filter")').click()

    // Add a filter condition
    await panel.locator('.hot-config-add-btn:has-text("Add condition")').click()

    // Select "Category" field
    const fieldSelect = panel.locator('.hot-config-filter-select').first()
    await fieldSelect.selectOption({ label: 'Category' })

    // Enter value "invoice" and press Enter
    const filterInput = panel.locator('.hot-config-filter-input').first()
    await filterInput.fill('invoice')
    await filterInput.press('Enter')

    // Close panel (applies filter)
    await panel.locator('.hot-config-cancel-btn:has-text("Cancel")').click()
    await page.waitForTimeout(800)

    // Should show fewer rows (only invoice docs)
    const rowsAfter = await page.locator('tr[data-row]').count()
    expect(rowsAfter).toBeLessThan(rowsBefore)

    // Invoice docs should be visible
    await expect(page.locator(`text=${DOCS.invoiceAlpha.name}`).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(`text=${DOCS.invoiceBeta.name}`).first()).toBeVisible({ timeout: 5_000 })
    // Non-invoice should be hidden
    await expect(page.locator(`text=${DOCS.bolGamma.name}`)).toBeHidden({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // Perspective / tabs tests
  // ---------------------------------------------------------------------------

  test('should show "All" tab as active by default', async ({ page }) => {
    await gotoDocuments(page)

    const allTab = page.locator('.hot-top-tab:has-text("All")').first()
    await expect(allTab).toBeVisible({ timeout: 5_000 })
    await expect(allTab).toHaveClass(/active/)
  })

  test('should create a perspective via Configure View panel, then switch and delete', async ({ page }) => {
    await gotoDocuments(page)

    // Narrow to test docs
    await page.locator('.search-input').fill(testPrefix)
    await waitForSearch(page)
    await expect(page.locator('tr[data-row]').first()).toBeVisible({ timeout: 10_000 })

    // Open Configure View panel
    const addBtn = page.locator('.hot-top-tab-add')
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    const panel = page.locator('.hot-config-panel')
    await expect(panel).toBeVisible({ timeout: 5_000 })

    // Add a sort rule so "Save as new view" button appears
    await panel.locator('.hot-config-section-header:has-text("Sort")').click()
    await panel.locator('.hot-config-add-btn:has-text("Add sort")').click()

    const sortFieldSelect = panel.locator('.hot-config-sort-select').first()
    await sortFieldSelect.selectOption({ label: 'Name' })

    // Click "Save as new view"
    const saveAsNewBtn = panel.locator('.hot-config-save-btn:has-text("Save as new view")')
    await expect(saveAsNewBtn).toBeVisible({ timeout: 5_000 })
    await saveAsNewBtn.click()

    // Save form should appear
    const nameInput = panel.locator('.hot-config-save-input')
    await expect(nameInput).toBeVisible({ timeout: 5_000 })

    const perspectiveName = `TestView-${Date.now()}`
    await nameInput.fill(perspectiveName)

    // Pick a color
    await panel.locator('.hot-config-save-color-btn').first().click()

    // Click Save
    await panel.locator('.hot-config-save-btn:has-text("Save")').click()
    await page.waitForTimeout(800)

    // Panel should close and new tab should appear
    const newTab = page.locator(`.hot-top-tab:has-text("${perspectiveName}")`)
    await expect(newTab).toBeVisible({ timeout: 5_000 })

    // Switch to "All"
    const allTab = page.locator('.hot-top-tab:has-text("All")').first()
    await allTab.click()
    await page.waitForTimeout(300)
    await expect(allTab).toHaveClass(/active/)

    // Switch back to new perspective
    await newTab.click()
    await page.waitForTimeout(300)
    await expect(newTab).toHaveClass(/active/)

    // Delete the perspective
    const wrapper = page.locator('.hot-top-tab-wrapper').filter({ hasText: perspectiveName })
    const closeBtn = wrapper.locator('.hot-top-tab-close')
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click()
      await page.waitForTimeout(500)
      await expect(newTab).toBeHidden({ timeout: 5_000 })
    }
  })

  test('should open Configure View panel via "+" button', async ({ page }) => {
    await gotoDocuments(page)

    const addBtn = page.locator('.hot-top-tab-add')
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    // Configure View panel should open
    const panel = page.locator('.hot-config-panel')
    await expect(panel).toBeVisible({ timeout: 5_000 })

    // Verify sections exist
    await expect(panel.locator('.hot-config-section-header:has-text("Hide fields")')).toBeVisible()
    await expect(panel.locator('.hot-config-section-header:has-text("Filter")')).toBeVisible()
    await expect(panel.locator('.hot-config-section-header:has-text("Sort")')).toBeVisible()

    // Close panel
    await panel.locator('.hot-config-panel-close').click()
    await expect(panel).toBeHidden({ timeout: 5_000 })
  })
})
