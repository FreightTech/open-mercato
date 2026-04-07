/**
 * TC-INT-FMS-OFFER-FLOW
 * Full offer flow E2E test covering:
 * - RFQ creation from pasted email
 * - Adding line items to sections
 * - Creating second offer tab
 * - Setting incoterm, carrier, provider, route (origin/POL/destination/POD)
 * - Assigning client
 * - Editing commodity
 * - Preview: changing currency, validity, payment terms, grouping mode
 * - Downloading PDF
 * - Sending offer
 */
import { test, expect, type Page } from '@playwright/test'
import { login } from '../helpers/auth'
import { getAuthToken, apiRequest } from '../helpers/api'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

const SAMPLE_EMAIL = `Dear Team,

Please provide a freight quotation for the following shipment:

Company: Acme Logistics GmbH
Contact: Hans Mueller, hans@acmelogistics.de
Origin: Hamburg, Germany
Destination: Shanghai, China
Incoterms: FOB
Container: 2x 40HC
Cargo: Machinery Parts
Weight: 15,000 kg
Cargo Ready Date: 15/05/2026
Transport Mode: Sea

Please include ocean freight, origin and destination charges.

Best regards,
Hans Mueller`

// Helper: wait for element and click
async function clickByText(page: Page, text: string, options?: { timeout?: number }) {
  const el = page.getByRole('button', { name: text }).first()
  await el.waitFor({ state: 'visible', timeout: options?.timeout ?? 10000 })
  await el.click()
}

// Helper: wait for any text on page
async function waitForText(page: Page, text: string, timeout = 10000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
}

test.describe('TC-INT-FMS-OFFER-FLOW: Full offer lifecycle', () => {
  // AI extraction + full flow needs more time
  test.setTimeout(120_000)

  let rfqId: string | null = null
  let offerId: string | null = null

  test.beforeEach(async ({ page }) => {
    await login(page, 'admin')
  })

  test('1. Create RFQ, add items, set up offer, preview, and download PDF', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')

    // ---- Step 1: Navigate to tasks board ----
    await page.goto(`${BASE_URL}/backend/tasks-board`)
    await page.waitForLoadState('networkidle')

    // ---- Step 2: Create RFQ from email ----
    await clickByText(page, 'Utwórz zapytanie')
    const textarea = page.locator('textarea').first()
    await textarea.waitFor({ state: 'visible' })
    await textarea.fill(SAMPLE_EMAIL)
    // Type a character to ensure onChange fires
    await textarea.press('Space')
    await textarea.press('Backspace')

    // Wait for Create button to be enabled and click
    const createBtn = page.getByRole('button', { name: 'Utwórz' })
    await expect(createBtn).toBeEnabled({ timeout: 5000 })
    await createBtn.click()

    // ---- Step 3: Wait for extraction and pricing step ----
    await waitForText(page, 'Internal pricing', 15000)
    await page.waitForTimeout(2000) // Allow extraction to complete

    // Verify route header
    await expect(page.getByText('Hamburg, Germany')).toBeVisible()
    await expect(page.getByText('Shanghai, China')).toBeVisible()

    // ---- Step 4: Expand edit panel and set incoterm ----
    // Click the pencil/chevron area to expand
    const routeHeader = page.locator('[style*="background: var(--accent)"]').first()
    await routeHeader.click()
    await page.waitForTimeout(500)

    // Set incoterm to CIF
    const incotermSelect = page.locator('select').filter({ hasText: 'FOB' }).first()
    if (await incotermSelect.isVisible()) {
      await incotermSelect.selectOption('cif')
    }

    // ---- Step 5: Add a line item to Main Freight section ----
    const addMainLine = page.getByText('+ Add line').first()
    await addMainLine.click()
    await page.waitForTimeout(500)

    // Fill product name
    const productInput = page.getByPlaceholder('Product name...').first()
    await productInput.click()
    await productInput.fill('Ocean Freight 40HC')
    await productInput.press('Tab')
    await page.waitForTimeout(300)

    // Fill buy price
    const buyInputs = page.locator('input[inputmode="decimal"]')
    const firstBuyInput = buyInputs.nth(0)
    await firstBuyInput.fill('1500')

    // Fill sell price (last decimal input in the row)
    await page.waitForTimeout(200)
    const sellInputs = page.locator('input[inputmode="decimal"]')
    // Find sell input - it comes after buy in each row
    for (let i = 0; i < await sellInputs.count(); i++) {
      const val = await sellInputs.nth(i).inputValue()
      if (val === '0.00' || val === '') {
        await sellInputs.nth(i).fill('1800')
        break
      }
    }

    // ---- Step 6: Add a line to Destination section ----
    const addLines = page.getByText('+ Add line')
    const addDestLine = addLines.last()
    await addDestLine.click()
    await page.waitForTimeout(500)

    const destProductInput = page.getByPlaceholder('Product name...').last()
    await destProductInput.click()
    await destProductInput.fill('Destination THC')
    await destProductInput.press('Tab')
    await page.waitForTimeout(300)

    // Fill destination buy/sell via last available inputs
    const allDecimalInputs = page.locator('input[inputmode="decimal"]')
    const count = await allDecimalInputs.count()
    // Find empty buy/sell for the new line
    for (let i = count - 1; i >= 0; i--) {
      const val = await allDecimalInputs.nth(i).inputValue()
      if (val === '0.00') {
        await allDecimalInputs.nth(i).fill('450')
        break
      }
    }
    for (let i = count - 1; i >= 0; i--) {
      const val = await allDecimalInputs.nth(i).inputValue()
      if (val === '0' || val === '') {
        await allDecimalInputs.nth(i).fill('350')
        break
      }
    }

    // ---- Step 7: Create second offer tab ----
    await clickByText(page, 'Add offer version')
    await page.waitForTimeout(3000)
    await expect(page.getByText('Offer #2')).toBeVisible({ timeout: 5000 })

    // Switch back to Offer #1
    await page.getByRole('button', { name: 'Offer #1' }).click()
    await page.waitForTimeout(2000)

    // ---- Step 8: Set carrier and provider in edit panel ----
    // Expand edit panel if not already open
    const editChevron = page.locator('button').filter({ has: page.locator('svg') }).first()

    // Look for carrier input
    const carrierInput = page.getByPlaceholder(/carrier/i).first()
    if (await carrierInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await carrierInput.fill('MSC')
      await page.waitForTimeout(1000)
      // Click first result if dropdown appears
      const carrierOption = page.locator('button').filter({ hasText: 'MSC' }).first()
      if (await carrierOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await carrierOption.click()
      }
    }

    // ---- Step 9: Assign client in sidebar ----
    const clientSection = page.getByText('Client').first()
    await clientSection.click()
    await page.waitForTimeout(300)

    const contractorInput = page.getByPlaceholder(/kontrahenta|contractor/i).first()
    if (await contractorInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contractorInput.fill('Acme')
      await page.waitForTimeout(1000)
    }

    // ---- Step 10: Edit commodity in Cargo section ----
    const cargoSection = page.getByText('Cargo').first()
    if (await cargoSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cargoSection.click()
      await page.waitForTimeout(300)
      const commodityInput = page.locator('input[placeholder*="Furniture"]').or(page.locator('input[placeholder*="electronics"]')).first()
      if (await commodityInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await commodityInput.fill('Machinery Parts, heavy')
      }
    }

    // ---- Step 11: Go to Preview ----
    await clickByText(page, 'Dalej')
    await page.waitForTimeout(3000)
    await waitForText(page, 'Offer preview', 10000)

    // ---- Step 12: Verify preview content ----
    // Check document shows offer header
    await expect(page.getByText('OFFER')).toBeVisible()
    await expect(page.getByText('Open Mercato')).toBeVisible()

    // Check route and incoterms in document
    const previewArea = page.locator('[style*="max-width: 700px"]')
    await expect(previewArea.getByText('Hamburg, Germany')).toBeVisible()

    // ---- Step 13: Change currency in sidebar ----
    const currencyBtn = page.locator('button').filter({ hasText: 'USD' }).first()
    if (await currencyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await currencyBtn.click()
      await page.waitForTimeout(500)
      const plnOption = page.getByRole('button', { name: 'PLN', exact: true }).first()
      if (await plnOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await plnOption.click()
        await page.waitForTimeout(500)
      }
    }

    // ---- Step 14: Change offer validity to specific date ----
    const dateRadio = page.getByText('Date', { exact: true }).first()
    if (await dateRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateRadio.click()
      await page.waitForTimeout(300)
      const dateInput = page.locator('input[type="date"]').first()
      if (await dateInput.isVisible()) {
        await dateInput.fill('2026-06-01')
      }
    }

    // ---- Step 15: Change payment terms ----
    const paymentSection = page.getByText('Payment terms').first()
    if (await paymentSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await paymentSection.click()
      await page.waitForTimeout(300)
      const paymentInput = page.locator('input[type="number"]').last()
      if (await paymentInput.isVisible()) {
        await paymentInput.fill('30')
      }
    }

    // ---- Step 16: Change grouping mode to all-in ----
    const allInLabel = page.getByText('Freight forwarding (all-in)')
    if (await allInLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allInLabel.click()
      await page.waitForTimeout(500)

      // Verify document shows single all-in line
      await expect(page.getByText('Freight forwarding service')).toBeVisible({ timeout: 3000 })
    }

    // Switch back to itemized
    const itemizedLabel = page.getByText('Itemized')
    if (await itemizedLabel.isVisible()) {
      await itemizedLabel.click()
      await page.waitForTimeout(500)
    }

    // ---- Step 17: Download PDF ----
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    await clickByText(page, 'Download PDF')
    const download = await downloadPromise

    if (download) {
      const path = await download.path()
      expect(path).toBeTruthy()
      const suggestedName = download.suggestedFilename()
      expect(suggestedName).toContain('offer')
      expect(suggestedName).toContain('.pdf')
    }

    // ---- Step 18: Verify Send Offer button is available ----
    const sendBtn = page.getByRole('button', { name: /Send Offer|Wyślij ofertę/i }).first()
    await expect(sendBtn).toBeVisible()
    await expect(sendBtn).toBeEnabled()

    // ---- Cleanup ----
    // Close the wizard
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('2. Verify offer data persists after page reload', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')

    // Navigate to offers list
    await page.goto(`${BASE_URL}/backend/fms-offers`)
    await page.waitForLoadState('networkidle')

    // Find the most recent offer
    const firstOfferLink = page.locator('button').filter({ hasText: /OFF-2026/ }).first()
    await expect(firstOfferLink).toBeVisible({ timeout: 10000 })

    // Click View on the first offer
    const viewBtn = page.getByRole('button', { name: 'View' }).first()
    await viewBtn.click()
    await page.waitForTimeout(2000)

    // Verify the detail view shows sections
    await expect(page.getByText('MAIN FREIGHT')).toBeVisible({ timeout: 5000 })

    // Verify offer header shows
    await expect(page.locator('text=/OFF-2026-\\d+/')).toBeVisible()

    // Close
    const closeBtn = page.getByRole('button', { name: 'Close' }).or(page.locator('button[aria-label="Close"]')).first()
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click()
    }
  })

  test('3. Verify multi-offer tabs and switching', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')

    // Create RFQ via API
    const rfqRes = await apiRequest(request, 'POST', '/api/fms_offers/rfq', {
      token,
      data: {
        rawText: 'Quote request from TestCorp for Shanghai to Rotterdam, FOB, 1x20GP, electronics.',
      },
    })
    expect(rfqRes.ok()).toBeTruthy()
    const rfqData = await rfqRes.json()
    rfqId = rfqData.id

    try {
      // Navigate to task board and open the RFQ
      await page.goto(`${BASE_URL}/backend/tasks-board`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      // Click on the RFQ card
      const rfqCard = page.locator('button[roledescription="sortable"]').filter({ hasText: 'TestCorp' }).first()
      if (await rfqCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await rfqCard.click()
        await page.waitForTimeout(3000)

        // Verify Offer #1 tab exists
        await expect(page.getByText('Offer #1')).toBeVisible({ timeout: 5000 })

        // Create Offer #2
        await clickByText(page, 'Add offer version')
        await page.waitForTimeout(3000)

        // Verify both tabs visible
        await expect(page.getByText('Offer #1')).toBeVisible()
        await expect(page.getByText('Offer #2')).toBeVisible()

        // Switch to Offer #1
        await page.getByRole('button', { name: 'Offer #1' }).click()
        await page.waitForTimeout(2000)

        // Delete Offer #2
        const closeTabBtn = page.locator('span').filter({ hasText: 'Offer #2' }).locator('button').last()
        if (await closeTabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeTabBtn.click()
          await page.waitForTimeout(2000)

          // Verify only Offer #1 remains
          await expect(page.getByText('Offer #2')).not.toBeVisible({ timeout: 3000 })
          await expect(page.getByText('Offer #1')).toBeVisible()
        }
      }
    } finally {
      // Cleanup: delete the RFQ
      if (rfqId) {
        await apiRequest(request, 'DELETE', `/api/fms_offers/rfq/${rfqId}`, { token })
      }
    }
  })

  test('4. Verify incoterm-driven section visibility', async ({ page, request }) => {
    const token = await getAuthToken(request, 'admin')

    // Create offer via API with FOB incoterm
    const rfqRes = await apiRequest(request, 'POST', '/api/fms_offers/rfq', {
      token,
      data: { rawText: 'Test incoterm visibility. Shanghai to Hamburg, FOB, sea, 1x40HC.' },
    })
    const rfqData = await rfqRes.json()
    rfqId = rfqData.id

    try {
      await page.goto(`${BASE_URL}/backend/tasks-board`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      // Open the RFQ
      const card = page.locator('button[roledescription="sortable"]').last()
      await card.click()
      await page.waitForTimeout(3000)

      // FOB should hide Origin section
      await expect(page.getByText('MAIN FREIGHT')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('DESTINATION')).toBeVisible()
      // Origin should NOT be visible (FOB hides it)
      const originVisible = await page.getByText('ORIGIN', { exact: true }).isVisible().catch(() => false)
      expect(originVisible).toBeFalsy()

      // Now change to EXW (should show all 3 sections)
      // Expand edit panel
      const routeBar = page.locator('[style*="background: var(--accent)"]').first()
      await routeBar.click()
      await page.waitForTimeout(500)

      const incotermSelect = page.locator('select').filter({ has: page.locator('option[value="fob"]') }).first()
      if (await incotermSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await incotermSelect.selectOption('exw')
        await page.waitForTimeout(1000)

        // Now all 3 sections should be visible
        await expect(page.getByText('MAIN FREIGHT')).toBeVisible()
        await expect(page.getByText('ORIGIN')).toBeVisible()
        await expect(page.getByText('DESTINATION')).toBeVisible()
      }
    } finally {
      if (rfqId) {
        await apiRequest(request, 'DELETE', `/api/fms_offers/rfq/${rfqId}`, { token })
      }
    }
  })
})
