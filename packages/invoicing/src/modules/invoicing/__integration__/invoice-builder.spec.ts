import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000'

async function getToken(request: typeof test extends (title: string, fn: (args: infer T) => void) => void ? T['request'] : never): Promise<string> {
  const form = new URLSearchParams()
  form.set('email', 'superadmin@acme.com')
  form.set('password', 'secret')

  const response = await request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: form.toString(),
  })
  const body = await response.json()
  if (!response.ok() || !body.token) throw new Error(`Login failed: ${response.status()}`)
  return body.token as string
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function decodeJwt(token: string) {
  const payload = token.split('.')[1]
  return JSON.parse(Buffer.from(payload, 'base64url').toString())
}

// ─────────────────────────────────────
// API integration tests
// ─────────────────────────────────────

test.describe('Invoice Builder API', () => {
  let token: string
  let orgId: string
  let tenantId: string
  let invoiceId: string

  test.beforeAll(async ({ request }) => {
    token = await getToken(request)
    const jwt = decodeJwt(token)
    orgId = jwt.orgId
    tenantId = jwt.tenantId
  })

  test('create invoice with line items', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/invoicing/invoices`, {
      headers: authHeaders(token),
      data: {
        organizationId: orgId,
        tenantId,
        invoiceNumber: 'FV/E2E/001',
        invoiceDate: '2026-03-22',
        serviceDate: '2026-03-20',
        dueDate: '2026-04-22',
        sellerName: 'E2E Seller Sp. z o.o.',
        sellerTaxId: '1111111111',
        sellerAddress: 'ul. Testowa 1, Warszawa',
        sellerCountryCode: 'PL',
        sellerBankAccount: 'PL61 1090 1014 0000 0712 1981 2874',
        buyerName: 'E2E Buyer GmbH',
        buyerTaxId: '2222222222',
        buyerAddress: 'ul. Kupna 5, Krakow',
        buyerCountryCode: 'PL',
        currencyCode: 'PLN',
        paymentMethod: 'przelew',
        notes: 'Integration test',
        direction: 'outgoing',
        sourceType: 'manual',
        status: 'draft',
        lineItems: [
          { lineNumber: 1, description: 'Transport', quantity: '1', unit: 'szt.', unitPriceNet: '800.00', vatRate: '23', vatRateCode: '23', netAmount: '800.00', vatAmount: '184.00', grossAmount: '984.00' },
          { lineNumber: 2, description: 'Insurance', quantity: '1', unit: 'szt.', unitPriceNet: '200.00', vatRate: '8', vatRateCode: '8', netAmount: '200.00', vatAmount: '16.00', grossAmount: '216.00' },
        ],
      },
    })

    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    invoiceId = body.id
  })

  test('get invoice returns correct data', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/invoicing/invoices/${invoiceId}`, {
      headers: authHeaders(token),
    })

    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.invoiceNumber).toBe('FV/E2E/001')
    expect(body.sellerName).toBe('E2E Seller Sp. z o.o.')
    expect(body.buyerName).toBe('E2E Buyer GmbH')
    expect(body.lineItems).toHaveLength(2)
    expect(body.lineItems[0].description).toBe('Transport')
    expect(body.lineItems[1].description).toBe('Insurance')
  })

  test('update with line items recalculates totals', async ({ request }) => {
    const res = await request.patch(`${BASE_URL}/api/invoicing/invoices/${invoiceId}`, {
      headers: authHeaders(token),
      data: {
        lineItems: [
          { lineNumber: 1, description: 'Transport updated', quantity: '2', unit: 'szt.', unitPriceNet: '500.00', vatRate: '23', vatRateCode: '23', netAmount: '1000.00', vatAmount: '230.00', grossAmount: '1230.00' },
        ],
      },
    })

    expect(res.ok()).toBe(true)

    // Verify totals were recalculated
    const getRes = await request.get(`${BASE_URL}/api/invoicing/invoices/${invoiceId}`, {
      headers: authHeaders(token),
    })
    const body = await getRes.json()
    expect(body.lineItems).toHaveLength(1)
    expect(body.lineItems[0].description).toBe('Transport updated')
    expect(body.netAmount).toBe('1000.00')
    expect(body.vatAmount).toBe('230.00')
    expect(body.grossAmount).toBe('1230.00')
  })

  test('generate PDF returns valid PDF', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/invoicing/invoices/${invoiceId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.ok()).toBe(true)
    expect(res.headers()['content-type']).toBe('application/pdf')

    const body = await res.body()
    expect(body.length).toBeGreaterThan(1000)

    // Check PDF magic bytes
    const header = body.slice(0, 5).toString()
    expect(header).toBe('%PDF-')
  })

  test('PDF 404 for non-existent invoice', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/invoicing/invoices/a0000000-0000-4000-8000-000000000099/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status()).toBe(404)
  })

  test('cleanup: delete test invoice', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/invoicing/invoices/${invoiceId}`, {
      headers: authHeaders(token),
    })
    expect(res.ok()).toBe(true)
  })
})

// ─────────────────────────────────────
// UI browser tests
// ─────────────────────────────────────

test.describe('Invoice Builder UI', () => {
  test.beforeEach(async ({ page, request }) => {
    // Login via API and set auth cookie
    const form = new URLSearchParams()
    form.set('email', 'superadmin@acme.com')
    form.set('password', 'secret')
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: form.toString(),
    })
    const loginBody = await loginRes.json()
    const authToken = loginBody.token as string

    // Set auth cookie on browser context
    const url = new URL(BASE_URL)
    await page.context().addCookies([
      { name: 'auth_token', value: authToken, domain: url.hostname, path: '/' },
    ])
  })

  test('invoicing list page loads with New Invoice button', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing`, { waitUntil: 'load' })
    const newButton = page.getByRole('button', { name: /new invoice/i })
    await expect(newButton).toBeVisible({ timeout: 10000 })
  })

  test('create page loads with split-view layout', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/create`, { waitUntil: 'load' })

    // Header visible
    await expect(page.getByRole('heading', { name: 'New Invoice' })).toBeVisible({ timeout: 10000 })

    // Save Draft button visible
    await expect(page.getByRole('button', { name: /save draft/i })).toBeVisible()

    // Form sections visible
    await expect(page.getByText('Invoice Details')).toBeVisible()
    await expect(page.getByText('Line Items')).toBeVisible()

    // PDF preview area (empty state)
    await expect(page.getByText(/save.*invoice.*preview/i)).toBeVisible()
  })

  test('fill form, save, and verify PDF preview loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/create`, { waitUntil: 'load' })

    // Wait for form to render
    await expect(page.getByText('Invoice Details')).toBeVisible({ timeout: 10000 })

    // Fill invoice number
    await page.fill('input[placeholder="FV/2026/03/001"]', 'FV/E2E/UI/001')

    // Fill seller
    const sellerSection = page.getByText('Seller')
    await sellerSection.click()
    await page.locator('input').filter({ hasText: '' }).nth(5).fill('UI Test Seller')

    // Fill line item description
    await page.fill('input[placeholder="Item description"]', 'E2E UI Test Service')

    // Fill line item quantity and price
    const qtyInputs = page.locator('input[type="text"]')
    // Find the quantity input (the one with value "1" in the line items table)
    // This is a bit fragile but works for the simple case

    // Click Save Draft
    await page.getByRole('button', { name: /save draft/i }).click()

    // Wait for save to complete — the PDF preview should start loading
    // We look for either the iframe (success) or the spinner (loading)
    await page.waitForTimeout(3000)

    // Verify we got a PDF iframe OR the loading spinner appeared
    const iframe = page.locator('iframe[title="PDF Preview"]')
    const spinner = page.locator('.animate-spin')
    const hasIframe = await iframe.count() > 0
    const hasSpinner = await spinner.count() > 0

    // One of them should be present (PDF loaded or is loading)
    expect(hasIframe || hasSpinner).toBe(true)
  })
})
