import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-INV-VERIFY-ALLOCATE: Invoice Cost Reconciliation
 *
 * Tests the full 2-step verify → allocate workflow from the invoicing module.
 */

function decodeJwt(token: string) {
  const payload = token.split('.')[1]
  return JSON.parse(Buffer.from(payload, 'base64url').toString())
}

/** Set auth cookie on browser context (avoids rate-limited login calls) */
async function setAuthCookie(page: import('@playwright/test').Page, token: string) {
  const url = new URL(BASE_URL)
  await page.context().addCookies([
    { name: 'auth_token', value: token, domain: url.hostname, path: '/' },
  ])
}

// ─────────────────────────────────────
// API integration tests
// ─────────────────────────────────────

test.describe('TC-INV-VERIFY-ALLOCATE: API — sourceLineItemId mapping', () => {
  test.setTimeout(60_000)

  let token: string
  let orgId: string
  let tenantId: string
  let fmsInvoiceId: string
  let invoicingInvoiceId: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
    const jwt = decodeJwt(token)
    orgId = jwt.orgId
    tenantId = jwt.tenantId
  })

  test.afterAll(async ({ request }) => {
    if (invoicingInvoiceId) {
      await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${invoicingInvoiceId}`, { token }).catch(() => {})
    }
    if (fmsInvoiceId) {
      await apiRequest(request, 'DELETE', `/api/fms_documents/invoices/${fmsInvoiceId}`, { token }).catch(() => {})
    }
  })

  test('create FMS invoice with line items', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/fms_documents/invoices', {
      token,
      data: {
        organizationId: orgId,
        tenantId,
        invoiceNumber: `FMS-VERIFY-${Date.now()}`,
        invoiceDate: '2026-03-20',
        dueDate: '2026-04-20',
        sellerName: 'MSC Mediterranean Shipping S.A.',
        sellerTaxId: 'CHE-111954803',
        sellerAddress: 'Chemin Rieu 12-14, CH-1208 Geneva, Switzerland',
        buyerName: 'INF Shipping Solutions Sp. z o.o.',
        buyerTaxId: 'PL6152069288',
        buyerAddress: 'ul. Weglowa 22C, Gdynia, 81-341, Poland',
        netAmount: '8492.00',
        vatAmount: '0',
        grossAmount: '8492.00',
        currencyCode: 'EUR',
        status: 'pending_review',
        blNumber: 'MEDUYK582433',
        vesselName: 'MSC AURORA',
        voyageNumber: 'QB552E',
        containerNumbers: ['MSMU3828891', 'MSMU3826055'],
        lineItems: [
          { lineNumber: 1, description: 'SEAFREIGHT', quantity: '7', unit: '20DV', unitPriceNet: '650.00', vatRate: '0', netAmount: '4550.00', vatAmount: '0', grossAmount: '4550.00' },
          { lineNumber: 2, description: 'ISPS', quantity: '7', unit: '20DV', unitPriceNet: '20.00', vatRate: '0', netAmount: '140.00', vatAmount: '0', grossAmount: '140.00' },
          { lineNumber: 3, description: 'TERMINAL HANDLING CHARGE', quantity: '7', unit: '20DV', unitPriceNet: '145.00', vatRate: '0', netAmount: '1015.00', vatAmount: '0', grossAmount: '1015.00' },
          { lineNumber: 4, description: 'DOCUMENTATION FEE', quantity: '1', unit: 'BL', unitPriceNet: '50.00', vatRate: '0', netAmount: '50.00', vatAmount: '0', grossAmount: '50.00' },
        ],
      },
    })

    expect(res.ok(), `Create FMS invoice failed: ${res.status()}`).toBe(true)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    fmsInvoiceId = body.id
  })

  test('import FMS invoice to invoicing module', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/invoicing/invoices/import-from-document', {
      token,
      data: { documentInvoiceId: fmsInvoiceId },
    })

    expect(res.ok(), `Import failed: ${res.status()}`).toBe(true)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    invoicingInvoiceId = body.id
  })

  test('imported invoice has correct metadata', async ({ request }) => {
    const res = await apiRequest(request, 'GET', `/api/invoicing/invoices/${invoicingInvoiceId}`, { token })
    expect(res.ok()).toBe(true)

    const body = await res.json()
    expect(body.status).toBe('pending_review')
    expect(body.direction).toBe('incoming')
    expect(body.sourceType).toBe('document_extraction')
    expect(body.sourceDocumentInvoiceId).toBe(fmsInvoiceId)
    expect(body.currencyCode).toBe('EUR')
  })

  test('imported line items have sourceLineItemId populated', async ({ request }) => {
    const res = await apiRequest(request, 'GET', `/api/invoicing/invoices/${invoicingInvoiceId}`, { token })
    expect(res.ok()).toBe(true)

    const body = await res.json()
    const lineItems = body.lineItems as Array<Record<string, unknown>>
    expect(lineItems.length).toBe(4)

    for (const li of lineItems) {
      expect(li.sourceLineItemId, `Line "${li.description}" missing sourceLineItemId`).toBeTruthy()
      expect(typeof li.sourceLineItemId).toBe('string')
      expect((li.sourceLineItemId as string).length).toBe(36)
    }

    expect(lineItems[0].description).toBe('SEAFREIGHT')
    expect(lineItems[0].grossAmount).toBe('4550.00')
    expect(lineItems[1].description).toBe('ISPS')
    expect(lineItems[2].description).toBe('TERMINAL HANDLING CHARGE')
    expect(lineItems[3].description).toBe('DOCUMENTATION FEE')
  })

  test('sourceLineItemIds match actual FMS line item IDs', async ({ request }) => {
    const fmsRes = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${fmsInvoiceId}`, { token })
    expect(fmsRes.ok()).toBe(true)
    const fmsBody = await fmsRes.json()
    const fmsLineItems = (fmsBody.lineItems ?? []) as Array<Record<string, unknown>>

    const invRes = await apiRequest(request, 'GET', `/api/invoicing/invoices/${invoicingInvoiceId}`, { token })
    expect(invRes.ok()).toBe(true)
    const invBody = await invRes.json()
    const invLineItems = (invBody.lineItems ?? []) as Array<Record<string, unknown>>

    const fmsLineItemIds = new Set(fmsLineItems.map((li) => li.id))
    for (const li of invLineItems) {
      expect(
        fmsLineItemIds.has(li.sourceLineItemId as string),
        `sourceLineItemId ${li.sourceLineItemId} not found in FMS line items`
      ).toBe(true)
    }
  })
})

test.describe('TC-INV-VERIFY-ALLOCATE: API — Confirm and allocate flow', () => {
  test.setTimeout(60_000)

  let token: string
  let orgId: string
  let tenantId: string
  let fmsInvoiceId: string
  let invoicingInvoiceId: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
    const jwt = decodeJwt(token)
    orgId = jwt.orgId
    tenantId = jwt.tenantId

    const fmsRes = await apiRequest(request, 'POST', '/api/fms_documents/invoices', {
      token,
      data: {
        organizationId: orgId,
        tenantId,
        invoiceNumber: `FMS-ALLOC-${Date.now()}`,
        invoiceDate: '2026-03-20',
        dueDate: '2026-04-20',
        sellerName: 'Carrier Inc.',
        sellerTaxId: '9999999999',
        buyerName: 'Our Company Sp. z o.o.',
        buyerTaxId: 'PL1234567890',
        netAmount: '5000.00',
        vatAmount: '0',
        grossAmount: '5000.00',
        currencyCode: 'USD',
        status: 'pending_review',
        blNumber: 'TEST-BL-ALLOC-001',
        lineItems: [
          { lineNumber: 1, description: 'Ocean Freight', quantity: '7', unit: '20DV', unitPriceNet: '500.00', vatRate: '0', netAmount: '3500.00', vatAmount: '0', grossAmount: '3500.00' },
          { lineNumber: 2, description: 'Documentation Fee', quantity: '1', unit: 'BL', unitPriceNet: '75.00', vatRate: '0', netAmount: '75.00', vatAmount: '0', grossAmount: '75.00' },
        ],
      },
    })
    expect(fmsRes.ok()).toBe(true)
    fmsInvoiceId = (await fmsRes.json()).id

    const impRes = await apiRequest(request, 'POST', '/api/invoicing/invoices/import-from-document', {
      token,
      data: { documentInvoiceId: fmsInvoiceId },
    })
    expect(impRes.ok()).toBe(true)
    invoicingInvoiceId = (await impRes.json()).id
  })

  test.afterAll(async ({ request }) => {
    if (invoicingInvoiceId) {
      await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${invoicingInvoiceId}`, { token }).catch(() => {})
    }
    if (fmsInvoiceId) {
      await apiRequest(request, 'DELETE', `/api/fms_documents/invoices/${fmsInvoiceId}`, { token }).catch(() => {})
    }
  })

  test('confirm FMS invoice as project_cost', async ({ request }) => {
    const res = await apiRequest(request, 'POST', `/api/fms_documents/invoices/${fmsInvoiceId}/confirm`, {
      token,
      data: { invoiceType: 'project_cost' },
    })
    expect(res.ok(), `Confirm failed: ${res.status()}`).toBe(true)

    const getRes = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${fmsInvoiceId}`, { token })
    const fmsBody = await getRes.json()
    expect(fmsBody.status).toBe('confirmed')
    expect(fmsBody.invoiceType).toBe('project_cost')
  })

  test('update invoicing invoice status after confirm', async ({ request }) => {
    const res = await apiRequest(request, 'PATCH', `/api/invoicing/invoices/${invoicingInvoiceId}`, {
      token,
      data: { status: 'pending_review' },
    })
    expect(res.ok(), `Status update failed: ${res.status()}`).toBe(true)

    const getRes = await apiRequest(request, 'GET', `/api/invoicing/invoices/${invoicingInvoiceId}`, { token })
    const body = await getRes.json()
    expect(body.status).toBe('pending_review')
  })

  test('fetch matched projects returns data', async ({ request }) => {
    const res = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${fmsInvoiceId}/project-lines`, { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body).toHaveProperty('projects')
    expect(Array.isArray(body.projects)).toBe(true)
  })

  test('fetch allocations returns empty initially', async ({ request }) => {
    const res = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${fmsInvoiceId}/allocations`, { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body).toHaveProperty('allocations')
    expect(body.allocations).toHaveLength(0)
  })

  test('confirm as company_expense works correctly', async ({ request }) => {
    const createRes = await apiRequest(request, 'POST', '/api/fms_documents/invoices', {
      token,
      data: {
        organizationId: orgId,
        tenantId,
        invoiceNumber: `FMS-EXPENSE-${Date.now()}`,
        invoiceDate: '2026-03-20',
        sellerName: 'Telco Provider',
        buyerName: 'Our Company',
        netAmount: '200.00',
        vatAmount: '46.00',
        grossAmount: '246.00',
        currencyCode: 'PLN',
        status: 'pending_review',
        lineItems: [
          { lineNumber: 1, description: 'Monthly subscription', quantity: '1', unit: 'szt.', unitPriceNet: '200.00', vatRate: '23', netAmount: '200.00', vatAmount: '46.00', grossAmount: '246.00' },
        ],
      },
    })
    expect(createRes.ok()).toBe(true)
    const expenseInvoiceId = (await createRes.json()).id

    const confirmRes = await apiRequest(request, 'POST', `/api/fms_documents/invoices/${expenseInvoiceId}/confirm`, {
      token,
      data: {
        invoiceType: 'company_expense',
        expenseCategory: 'telecom',
        expenseNote: 'Monthly phone bill',
      },
    })
    expect(confirmRes.ok()).toBe(true)

    const getRes = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${expenseInvoiceId}`, { token })
    const body = await getRes.json()
    expect(body.invoiceType).toBe('company_expense')
    expect(body.expenseCategory).toBe('telecom')
    expect(body.status).toBe('confirmed')

    await apiRequest(request, 'DELETE', `/api/fms_documents/invoices/${expenseInvoiceId}`, { token }).catch(() => {})
  })
})

// ─────────────────────────────────────
// UI browser tests — single describe to minimize auth calls
// ─────────────────────────────────────

test.describe('TC-INV-VERIFY-ALLOCATE: UI', () => {
  test.setTimeout(60_000)

  let token: string
  let orgId: string
  let tenantId: string
  let fmsInvoiceIdVerify: string
  let invoicingInvoiceIdVerify: string
  let fmsInvoiceIdAllocate: string
  let invoicingInvoiceIdAllocate: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
    const jwt = decodeJwt(token)
    orgId = jwt.orgId
    tenantId = jwt.tenantId

    // Create FMS invoice for verify page tests
    const fmsRes1 = await apiRequest(request, 'POST', '/api/fms_documents/invoices', {
      token,
      data: {
        organizationId: orgId,
        tenantId,
        invoiceNumber: `FMS-UI-V-${Date.now()}`,
        invoiceDate: '2026-03-20',
        dueDate: '2026-04-20',
        sellerName: 'MSC Mediterranean Shipping S.A.',
        sellerTaxId: 'CHE-111954803',
        buyerName: 'INF Shipping Solutions Sp. z o.o.',
        buyerTaxId: 'PL6152069288',
        netAmount: '4690.00',
        vatAmount: '0',
        grossAmount: '4690.00',
        currencyCode: 'EUR',
        status: 'pending_review',
        extractionConfidence: 'HIGH',
        blNumber: 'MEDUYK582433',
        vesselName: 'MSC AURORA',
        voyageNumber: 'QB552E',
        containerNumbers: ['MSMU3828891', 'MSMU3826055'],
        transportationMetadata: {
          bookingNumber: '159GD0059863',
          portOfLoading: 'GDYNIA',
          portOfDischarge: 'CAUCEDO',
        },
        lineItems: [
          { lineNumber: 1, description: 'SEAFREIGHT', quantity: '7', unit: '20DV', unitPriceNet: '650.00', vatRate: '0', netAmount: '4550.00', vatAmount: '0', grossAmount: '4550.00' },
          { lineNumber: 2, description: 'ISPS', quantity: '7', unit: '20DV', unitPriceNet: '20.00', vatRate: '0', netAmount: '140.00', vatAmount: '0', grossAmount: '140.00' },
        ],
      },
    })
    expect(fmsRes1.ok()).toBe(true)
    fmsInvoiceIdVerify = (await fmsRes1.json()).id

    const impRes1 = await apiRequest(request, 'POST', '/api/invoicing/invoices/import-from-document', {
      token,
      data: { documentInvoiceId: fmsInvoiceIdVerify },
    })
    expect(impRes1.ok()).toBe(true)
    invoicingInvoiceIdVerify = (await impRes1.json()).id

    // Set to extracted status for drawer button test
    await apiRequest(request, 'PATCH', `/api/invoicing/invoices/${invoicingInvoiceIdVerify}`, {
      token,
      data: { status: 'extracted' },
    })

    // Create FMS invoice for allocate page tests (confirmed)
    const fmsRes2 = await apiRequest(request, 'POST', '/api/fms_documents/invoices', {
      token,
      data: {
        organizationId: orgId,
        tenantId,
        invoiceNumber: `FMS-UI-A-${Date.now()}`,
        invoiceDate: '2026-03-20',
        sellerName: 'MSC Shipping',
        buyerName: 'INF Shipping',
        netAmount: '5000.00',
        grossAmount: '5000.00',
        currencyCode: 'EUR',
        status: 'pending_review',
        blNumber: 'TEST-BL-UI-002',
        lineItems: [
          { lineNumber: 1, description: 'SEAFREIGHT', quantity: '7', unit: '20DV', unitPriceNet: '500.00', vatRate: '0', netAmount: '3500.00', vatAmount: '0', grossAmount: '3500.00' },
          { lineNumber: 2, description: 'THC', quantity: '7', unit: '20DV', unitPriceNet: '145.00', vatRate: '0', netAmount: '1015.00', vatAmount: '0', grossAmount: '1015.00' },
          { lineNumber: 3, description: 'DOC FEE', quantity: '1', unit: 'BL', unitPriceNet: '50.00', vatRate: '0', netAmount: '50.00', vatAmount: '0', grossAmount: '50.00' },
        ],
      },
    })
    expect(fmsRes2.ok()).toBe(true)
    fmsInvoiceIdAllocate = (await fmsRes2.json()).id

    await apiRequest(request, 'POST', `/api/fms_documents/invoices/${fmsInvoiceIdAllocate}/confirm`, {
      token,
      data: { invoiceType: 'project_cost' },
    })

    const impRes2 = await apiRequest(request, 'POST', '/api/invoicing/invoices/import-from-document', {
      token,
      data: { documentInvoiceId: fmsInvoiceIdAllocate },
    })
    expect(impRes2.ok()).toBe(true)
    invoicingInvoiceIdAllocate = (await impRes2.json()).id

    await apiRequest(request, 'PATCH', `/api/invoicing/invoices/${invoicingInvoiceIdAllocate}`, {
      token,
      data: { status: 'pending_review' },
    })
  })

  test.afterAll(async ({ request }) => {
    for (const id of [invoicingInvoiceIdVerify, invoicingInvoiceIdAllocate]) {
      if (id) await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${id}`, { token }).catch(() => {})
    }
    for (const id of [fmsInvoiceIdVerify, fmsInvoiceIdAllocate]) {
      if (id) await apiRequest(request, 'DELETE', `/api/fms_documents/invoices/${id}`, { token }).catch(() => {})
    }
  })

  // Use cookie-based auth to avoid rate-limited login() calls
  test.beforeEach(async ({ page }) => {
    await setAuthCookie(page, token)
  })

  // ── Verify page tests ──

  test('verify page loads with correct structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/${invoicingInvoiceIdVerify}/verify`, { waitUntil: 'load' })

    await expect(page.getByText('1. Verify invoice')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('2. Allocate costs')).toBeVisible()
    await expect(page.getByText('Extracted data')).toBeVisible()
    await expect(page.getByText('MSC Mediterranean Shipping S.A.').first()).toBeVisible()
    await expect(page.getByText('INF Shipping Solutions Sp. z o.o.').first()).toBeVisible()
    await expect(page.getByText('Project cost')).toBeVisible()
    await expect(page.getByText('Company expense')).toBeVisible()
    await expect(page.getByText('SEAFREIGHT')).toBeVisible()
    await expect(page.getByText('ISPS')).toBeVisible()
    await expect(page.getByRole('button', { name: /reject/i })).toBeVisible()
  })

  test('selecting Project cost shows shipping details', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/${invoicingInvoiceIdVerify}/verify`, { waitUntil: 'load' })
    await expect(page.getByText('Extracted data')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Project cost').click()

    await expect(page.getByText('Shipping details')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('B/L Number')).toBeVisible()
    await expect(page.getByText('MEDUYK582433')).toBeVisible()
    await expect(page.getByText('MSC AURORA')).toBeVisible()
    await expect(page.getByRole('button', { name: /confirm & allocate/i })).toBeVisible()
  })

  test('selecting Company expense shows expense details', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/${invoicingInvoiceIdVerify}/verify`, { waitUntil: 'load' })
    await expect(page.getByText('Extracted data')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Company expense').click()

    await expect(page.getByText('Expense details')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Category')).toBeVisible()
    await expect(page.getByRole('button', { name: 'telecom', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'insurance', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /confirm expense/i })).toBeVisible()
  })

  // ── Allocate page tests ──

  test('allocate page loads with correct structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/${invoicingInvoiceIdAllocate}/verify/allocate`, { waitUntil: 'load' })

    await expect(page.getByText('1. Verify invoice')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('2. Allocate costs')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
    await expect(page.getByText('Invoice costs')).toBeVisible()
    await expect(page.getByText('SEAFREIGHT')).toBeVisible()
    await expect(page.getByText('THC')).toBeVisible()
    await expect(page.getByText('DOC FEE')).toBeVisible()
    await expect(page.getByText(/\d+\/\d+ allocated/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /save allocation/i })).toBeVisible()
  })

  test('allocate page shows hint message', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/${invoicingInvoiceIdAllocate}/verify/allocate`, { waitUntil: 'load' })
    await expect(page.getByText('Invoice costs')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/select an offer line/i)).toBeVisible()
  })

  test('save allocation button is disabled when no pending allocations', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/${invoicingInvoiceIdAllocate}/verify/allocate`, { waitUntil: 'load' })
    await expect(page.getByText('Invoice costs')).toBeVisible({ timeout: 15_000 })

    const saveButton = page.getByRole('button', { name: /save allocation/i })
    await expect(saveButton).toBeDisabled()
  })

  test('back button navigates to verify page', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/${invoicingInvoiceIdAllocate}/verify/allocate`, { waitUntil: 'load' })
    await expect(page.getByText('Invoice costs')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.waitForURL(`**/backend/invoicing/${invoicingInvoiceIdAllocate}/verify`, { timeout: 10_000 })
  })

  test('total amount displays correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/backend/invoicing/${invoicingInvoiceIdAllocate}/verify/allocate`, { waitUntil: 'load' })
    await expect(page.getByText('Invoice costs')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Total: EUR')).toBeVisible()
  })
})
