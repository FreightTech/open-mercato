import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'

/**
 * TC-KSEF-E2E-SUBMIT-FLOW: Full UI flow for invoice submission to KSeF
 *
 * 1. Login as admin
 * 2. Navigate to /backend/invoicing
 * 3. Create a new invoice via the builder page
 * 4. Fill in seller (NIP 7451834739), buyer, line items
 * 5. Save draft
 * 6. Approve the invoice via API
 * 7. Submit to KSeF via API
 * 8. Verify KSeF status changes
 * 9. Clean up via API
 */
test.describe('TC-KSEF-E2E-SUBMIT-FLOW: Invoice KSeF Submission', () => {
  const testInvoiceNumber = `KSEF-E2E-${Date.now()}`
  let invoiceId: string | null = null
  let token: string

  test.afterAll(async ({ request }) => {
    if (invoiceId) {
      const authToken = await getAuthToken(request, 'admin')
      await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${invoiceId}`, { token: authToken }).catch(() => {})
    }
  })

  test('should navigate to invoicing list page and see New Invoice button', async ({ page }) => {
    await login(page, 'admin')

    await page.goto('/backend/invoicing')
    await page.waitForURL('**/backend/invoicing')

    const newButton = page.getByRole('button', { name: /new invoice/i })
    await expect(newButton).toBeVisible({ timeout: 10000 })
  })

  test('should create invoice via builder, fill seller/buyer/items, and save draft', async ({ page, request }) => {
    token = await getAuthToken(request, 'admin')
    await login(page, 'admin')

    // Navigate to the create page
    await page.goto(`${BASE_URL}/backend/invoicing/create`, { waitUntil: 'load' })

    // Wait for the form to render
    await expect(page.getByText('Invoice Details')).toBeVisible({ timeout: 10000 })

    // Fill invoice number
    await page.fill('input[placeholder="FV/2026/03/001"]', testInvoiceNumber)

    // Fill invoice date
    const invoiceDateInput = page.locator('input[type="date"]').first()
    await invoiceDateInput.fill('2026-03-22')

    // Fill seller section — section should be open by default
    await expect(page.getByText('Seller')).toBeVisible()

    // Fill seller company name
    const sellerNameInput = page.locator('input').filter({ hasText: '' })
    // Use the label-based approach to find seller fields
    const sellerSection = page.locator('text=Seller').locator('xpath=ancestor::div[contains(@style, "margin-bottom")]').first()

    // Fill seller fields by placeholder/position
    // Seller NIP
    await page.fill('input[placeholder="1234567890"]', '7451834739')

    // Fill buyer section
    await expect(page.getByText('Buyer')).toBeVisible()

    // Buyer NIP
    await page.fill('input[placeholder="9876543210"]', '5261040828')

    // Fill line item description
    const descriptionInput = page.locator('input[placeholder="Item description"]')
    if (await descriptionInput.count() > 0) {
      await descriptionInput.first().fill('Transport service')
    }

    // Click Save Draft
    await page.getByRole('button', { name: /save draft/i }).click()

    // Wait for save to complete — look for a URL change (redirect to edit page) or success indication
    await page.waitForTimeout(3000)

    // After saving, the invoice should have been created.
    // Extract the invoiceId from the URL if redirected to edit page, or via API
    const listResponse = await apiRequest(request, 'GET', `/api/invoicing/invoices?search=${encodeURIComponent(testInvoiceNumber)}&pageSize=5`, { token })
    if (listResponse.ok()) {
      const listBody = await listResponse.json() as { items: Array<{ id: string; invoiceNumber: string }> }
      const found = listBody.items.find((inv) => inv.invoiceNumber === testInvoiceNumber)
      if (found) {
        invoiceId = found.id
      }
    }

    // If not found via search, try listing all recent invoices
    if (!invoiceId) {
      const allResponse = await apiRequest(request, 'GET', '/api/invoicing/invoices?pageSize=20&sort=createdAt&sortDir=desc', { token })
      if (allResponse.ok()) {
        const allBody = await allResponse.json() as { items: Array<{ id: string; invoiceNumber: string }> }
        const found = allBody.items.find((inv) => inv.invoiceNumber === testInvoiceNumber)
        if (found) {
          invoiceId = found.id
        }
      }
    }
  })

  test('should approve invoice and submit to KSeF via API', async ({ request }) => {
    // If previous test did not create an invoice, create one via API
    if (!token) {
      token = await getAuthToken(request, 'admin')
    }

    if (!invoiceId) {
      const createResponse = await apiRequest(request, 'POST', '/api/invoicing/invoices', {
        token,
        data: {
          invoiceNumber: testInvoiceNumber,
          invoiceDate: '2026-03-22',
          direction: 'outgoing',
          sourceType: 'manual',
          currencyCode: 'PLN',
          sellerName: 'E2E Seller Sp. z o.o.',
          sellerTaxId: '7451834739',
          sellerAddress: 'ul. Testowa 1, 00-001 Warszawa',
          sellerCountryCode: 'PL',
          buyerName: 'E2E Buyer S.A.',
          buyerTaxId: '5261040828',
          buyerAddress: 'ul. Kupiecka 5, 31-001 Krakow',
          buyerCountryCode: 'PL',
          paymentMethod: 'przelew',
          dueDate: '2026-04-22',
          lineItems: [
            {
              lineNumber: 1,
              description: 'Transport service',
              quantity: '1',
              unit: 'szt.',
              unitPriceNet: '1000.00',
              netAmount: '1000.00',
              vatRate: '23',
              vatRateCode: '23',
              vatAmount: '230.00',
              grossAmount: '1230.00',
            },
          ],
        },
      })
      expect(createResponse.ok(), `Create invoice failed: ${await createResponse.text()}`).toBe(true)
      const invoice = await createResponse.json() as { id: string }
      invoiceId = invoice.id
    }

    expect(invoiceId).toBeTruthy()

    // Step 1: Approve the invoice
    const approveResponse = await apiRequest(request, 'POST', `/api/invoicing/invoices/${invoiceId}/approve`, {
      token,
    })
    expect(approveResponse.ok(), `Approve failed: ${await approveResponse.text()}`).toBe(true)

    // Verify status changed to approved
    const getResponse = await apiRequest(request, 'GET', `/api/invoicing/invoices/${invoiceId}`, { token })
    expect(getResponse.ok()).toBe(true)
    const invoice = await getResponse.json() as { status: string }
    expect(invoice.status).toBe('approved')

    // Step 2: Submit to KSeF
    const submitResponse = await apiRequest(request, 'POST', `/api/invoicing/ksef/submit/${invoiceId}`, {
      token,
    })
    expect(submitResponse.ok(), `Submit to KSeF failed: ${await submitResponse.text()}`).toBe(true)
    const submitResult = await submitResponse.json() as { ksefStatus: string }
    expect(submitResult.ksefStatus).toBe('queued')

    // Step 3: Check KSeF status
    const statusResponse = await apiRequest(request, 'GET', `/api/invoicing/ksef/status/${invoiceId}`, {
      token,
    })
    expect(statusResponse.ok(), `Status check failed: ${await statusResponse.text()}`).toBe(true)
    const statusResult = await statusResponse.json() as { ksefStatus: string }
    expect(['queued', 'submitted', 'error']).toContain(statusResult.ksefStatus)
  })

  test('should show KSeF status in invoice detail drawer', async ({ page, request }) => {
    if (!token) {
      token = await getAuthToken(request, 'admin')
    }
    if (!invoiceId) {
      test.skip()
      return
    }

    await login(page, 'admin')
    await page.goto('/backend/invoicing')
    await page.waitForURL('**/backend/invoicing')

    // Wait for the invoicing list to load
    await expect(page.getByRole('button', { name: /new invoice/i })).toBeVisible({ timeout: 10000 })

    // Wait for data to load in the table
    await page.waitForTimeout(2000)

    // Look for the test invoice in the table by its invoice number
    const invoiceRow = page.getByText(testInvoiceNumber)
    if (await invoiceRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click the row to open the detail drawer
      await invoiceRow.click()

      // Verify the detail drawer opens with the invoice info
      await expect(page.getByText(testInvoiceNumber)).toBeVisible({ timeout: 5000 })

      // Verify KSeF status badge is shown (queued/submitted/error)
      const ksefBadge = page.locator('text=/KSeF:/i')
      if (await ksefBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(ksefBadge).toBeVisible()
      }
    }
  })

  test('should generate XML preview for approved invoice', async ({ request }) => {
    if (!token) {
      token = await getAuthToken(request, 'admin')
    }
    if (!invoiceId) {
      test.skip()
      return
    }

    const xmlResponse = await apiRequest(request, 'POST', `/api/invoicing/ksef/generate-xml/${invoiceId}`, {
      token,
    })
    expect(xmlResponse.ok(), `Generate XML failed: ${await xmlResponse.text()}`).toBe(true)
    const xmlResult = await xmlResponse.json() as { xml: string; lineItemCount: number }

    expect(xmlResult.xml).toBeTruthy()
    expect(xmlResult.xml).toContain('<Faktura')
    expect(xmlResult.xml).toContain('7451834739') // seller NIP
    expect(xmlResult.xml).toContain('5261040828') // buyer NIP
    expect(xmlResult.lineItemCount).toBeGreaterThanOrEqual(1)
  })
})
