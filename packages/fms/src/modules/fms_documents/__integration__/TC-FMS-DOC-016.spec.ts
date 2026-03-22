/**
 * TC-FMS-DOC-016: Invoice Cost Management
 *
 * Tests the 2-step invoice cost verification and allocation workflow:
 * Phase 1: API tests — CRUD for invoices with new fields, confirm, toggle exclude, allocations
 * Phase 2: UI tests — Verify invoice page and allocate costs page
 */
import { test, expect } from '@playwright/test'
import {
  getAuthToken,
  apiRequest,
} from '@open-mercato/core/modules/core/__integration__/helpers/api'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// ========================================
// Helper functions
// ========================================

/**
 * Resolve tenant and organization IDs via the directory API.
 * Caches the result so we only call once per test run.
 */
let cachedScope: { tenantId: string; organizationId: string } | null = null

async function resolveScope(
  request: Parameters<typeof apiRequest>[0],
  token: string
): Promise<{ tenantId: string; organizationId: string }> {
  if (cachedScope) return cachedScope
  const resp = await apiRequest(request, 'GET', '/api/directory/tenants', { token })
  const body = await resp.json()
  const tenants = body.items ?? body.data ?? body ?? []
  const tenant = Array.isArray(tenants) && tenants.length > 0 ? tenants[0] : null
  const tenantId = tenant?.id ?? tenant?.tenantId
  if (!tenantId) throw new Error('Could not resolve tenantId from /api/directory/tenants')

  const orgResp = await apiRequest(request, 'GET', '/api/directory/organizations', { token })
  const orgBody = await orgResp.json()
  const orgs = orgBody.items ?? orgBody.data ?? orgBody ?? []
  const org = Array.isArray(orgs) && orgs.length > 0 ? orgs[0] : null
  const organizationId = org?.id ?? org?.organizationId
  if (!organizationId) throw new Error('Could not resolve organizationId from /api/directory/organizations')

  cachedScope = { tenantId, organizationId }
  return cachedScope
}

async function createInvoiceFixture(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  overrides: Record<string, unknown> = {}
) {
  const scope = await resolveScope(request, token)
  const response = await apiRequest(request, 'POST', '/api/fms_documents/invoices', {
    token,
    data: {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      invoiceNumber: `TEST-INV-${Date.now()}`,
      invoiceDate: '2026-03-20',
      sellerName: 'Test Seller Sp. z o.o.',
      sellerTaxId: '1234567890',
      buyerName: 'Test Buyer S.A.',
      buyerTaxId: '0987654321',
      netAmount: '1000.00',
      vatAmount: '230.00',
      grossAmount: '1230.00',
      currencyCode: 'PLN',
      lineItems: [
        {
          lineNumber: 1,
          description: 'Ocean freight - FCL 40HC',
          quantity: '2',
          unitPriceNet: '500.00',
          vatRate: '23',
          netAmount: '1000.00',
          vatAmount: '230.00',
          grossAmount: '1230.00',
        },
      ],
      ...overrides,
    },
  })
  if (!response.ok()) {
    const errBody = await response.text()
    throw new Error(`createInvoiceFixture failed (${response.status()}): ${errBody}`)
  }
  const body = await response.json()
  return body as { id: string }
}

async function deleteInvoiceIfExists(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  invoiceId: string | null
) {
  if (!invoiceId) return
  try {
    await apiRequest(request, 'DELETE', `/api/fms_documents/invoices/${invoiceId}`, { token })
  } catch {
    // best-effort cleanup
  }
}

// ========================================
// Phase 1: API Tests
// ========================================

test.describe('TC-FMS-DOC-016: Invoice Cost Management — API', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
  })

  test('016-A01: Create invoice with new cost management fields', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token, {
        invoiceType: 'project_cost',
        expenseCategory: null,
        expenseNote: null,
      })
      invoiceId = result.id
      expect(invoiceId).toBeTruthy()

      // Fetch and verify
      const getResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}`, { token })
      if (!getResp.ok()) {
        const errText = await getResp.text()
        throw new Error(`GET invoice failed (${getResp.status()}): ${errText}`)
      }
      const invoice = await getResp.json()
      expect(invoice.invoiceType).toBe('project_cost')
      expect(invoice.status).toBe('pending_review')
      expect(invoice.sellerContractorId).toBeNull()
      expect(invoice.buyerContractorId).toBeNull()
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A02: Create invoice as company expense with expenseCategory', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token, {
        invoiceType: 'company_expense',
        expenseCategory: 'telecom',
        expenseNote: 'Monthly phone bill',
      })
      invoiceId = result.id

      const getResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}`, { token })
      const invoice = await getResp.json()
      expect(invoice.invoiceType).toBe('company_expense')
      expect(invoice.expenseCategory).toBe('telecom')
      expect(invoice.expenseNote).toBe('Monthly phone bill')
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A03: Line items include isExcluded and isManuallyAdded fields', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      const getResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}`, { token })
      const invoice = await getResp.json()
      expect(invoice.lineItems).toBeDefined()
      expect(invoice.lineItems.length).toBe(1)
      expect(invoice.lineItems[0].isExcluded).toBe(false)
      expect(invoice.lineItems[0].isManuallyAdded).toBe(false)
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A04: Toggle line item exclude and verify totals recalculation', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      // Create invoice with 2 line items
      const result = await createInvoiceFixture(request, token, {
        lineItems: [
          {
            lineNumber: 1,
            description: 'Line A',
            quantity: '1',
            unitPriceNet: '100.00',
            vatRate: '23',
            netAmount: '100.00',
            vatAmount: '23.00',
            grossAmount: '123.00',
          },
          {
            lineNumber: 2,
            description: 'Line B',
            quantity: '1',
            unitPriceNet: '200.00',
            vatRate: '23',
            netAmount: '200.00',
            vatAmount: '46.00',
            grossAmount: '246.00',
          },
        ],
        netAmount: '300.00',
        vatAmount: '69.00',
        grossAmount: '369.00',
      })
      invoiceId = result.id

      // Get the line items
      const getResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}`, { token })
      const invoice = await getResp.json()
      const lineAId = invoice.lineItems.find((li: any) => li.description === 'Line A')?.id
      expect(lineAId).toBeTruthy()

      // Toggle exclude on Line A
      const toggleResp = await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/toggle-exclude`, {
        token,
        data: { lineItemId: lineAId },
      })
      expect(toggleResp.ok()).toBeTruthy()
      const toggleResult = await toggleResp.json()
      expect(toggleResult.isExcluded).toBe(true)

      // Verify the invoice reflects only Line B totals won't be recalculated by toggle alone
      // (toggle recalculates totals)
      const getResp2 = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}`, { token })
      const updated = await getResp2.json()
      // After excluding Line A (100 net), only Line B (200 net) remains
      expect(parseFloat(updated.netAmount)).toBeCloseTo(200.00, 1)
      expect(parseFloat(updated.grossAmount)).toBeCloseTo(246.00, 1)
      expect(updated.lineItems.find((li: any) => li.id === lineAId)?.isExcluded).toBe(true)
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A05: Confirm invoice as project_cost sets status to confirmed', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      const confirmResp = await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/confirm`, {
        token,
        data: { invoiceType: 'project_cost' },
      })
      expect(confirmResp.ok()).toBeTruthy()

      const getResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}`, { token })
      const invoice = await getResp.json()
      expect(invoice.status).toBe('confirmed')
      expect(invoice.invoiceType).toBe('project_cost')
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A06: Confirm invoice as company_expense requires expenseCategory', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      // Attempt without category — should fail
      const failResp = await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/confirm`, {
        token,
        data: { invoiceType: 'company_expense' },
      })
      expect(failResp.ok()).toBeFalsy()

      // With category — should succeed
      const successResp = await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/confirm`, {
        token,
        data: {
          invoiceType: 'company_expense',
          expenseCategory: 'insurance',
          expenseNote: 'Q1 cargo insurance',
        },
      })
      expect(successResp.ok()).toBeTruthy()

      const getResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}`, { token })
      const invoice = await getResp.json()
      expect(invoice.status).toBe('confirmed')
      expect(invoice.invoiceType).toBe('company_expense')
      expect(invoice.expenseCategory).toBe('insurance')
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A07: Match contractors endpoint returns seller/buyer match status', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      const matchResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}/match-contractors`, { token })
      expect(matchResp.ok()).toBeTruthy()

      const body = await matchResp.json()
      expect(body.seller).toBeDefined()
      expect(body.seller.name).toBe('Test Seller Sp. z o.o.')
      expect(body.seller.taxId).toBe('1234567890')
      expect(typeof body.seller.matched).toBe('boolean')

      expect(body.buyer).toBeDefined()
      expect(body.buyer.name).toBe('Test Buyer S.A.')
      expect(typeof body.buyer.matched).toBe('boolean')
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A08: Invoice list API supports invoiceType and documentId filters', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token, { invoiceType: 'project_cost' })
      invoiceId = result.id

      const listResp = await apiRequest(request, 'GET', '/api/fms_documents/invoices?invoiceType=project_cost&limit=5', { token })
      expect(listResp.ok()).toBeTruthy()
      const body = await listResp.json()
      expect(body.items).toBeDefined()

      // All returned items should have project_cost type
      for (const item of body.items) {
        expect(item.invoiceType).toBe('project_cost')
      }
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A09: Invoice list includes confirmed status filter', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      // Confirm it
      await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/confirm`, {
        token,
        data: { invoiceType: 'project_cost' },
      })

      const listResp = await apiRequest(request, 'GET', '/api/fms_documents/invoices?status=confirmed&limit=5', { token })
      expect(listResp.ok()).toBeTruthy()
      const body = await listResp.json()
      for (const item of body.items) {
        expect(item.status).toBe('confirmed')
      }
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A10: Cost allocations CRUD — list empty, save, list populated, remove', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      // Confirm first
      await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/confirm`, {
        token,
        data: { invoiceType: 'project_cost' },
      })

      // Get line items
      const getResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}`, { token })
      const invoice = await getResp.json()
      const lineItemId = invoice.lineItems[0]?.id
      expect(lineItemId).toBeTruthy()

      // List allocations — should be empty
      const listResp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}/allocations`, { token })
      expect(listResp.ok()).toBeTruthy()
      const listBody = await listResp.json()
      expect(listBody.allocations).toHaveLength(0)

      // Use fake but valid UUID v4 project/line IDs for this test
      const fakeProjectId = '10000000-1000-4000-a000-000000000001'
      const fakeProjectLineId = '10000000-1000-4000-a000-000000000002'

      // Save allocation
      const saveResp = await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/allocations`, {
        token,
        data: {
          allocations: [{
            lineItemId,
            projectId: fakeProjectId,
            projectLineId: fakeProjectLineId,
            amount: '1230.00',
            currencyCode: 'PLN',
          }],
        },
      })
      if (!saveResp.ok()) {
        const errText = await saveResp.text()
        throw new Error(`Save allocations failed (${saveResp.status()}): ${errText}`)
      }
      const saveBody = await saveResp.json()
      expect(saveBody.saved).toBe(1)

      // List again — should have 1
      const listResp2 = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}/allocations`, { token })
      const listBody2 = await listResp2.json()
      expect(listBody2.allocations).toHaveLength(1)
      expect(listBody2.allocations[0].status).toBe('saved')
      expect(listBody2.allocations[0].amount).toBe('1230.00')

      const allocationId = listBody2.allocations[0].id

      // Remove allocation
      const removeResp = await apiRequest(request, 'DELETE', `/api/fms_documents/invoices/${invoiceId}/allocations/${allocationId}`, { token })
      expect(removeResp.ok()).toBeTruthy()

      // Verify removed
      const listResp3 = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}/allocations`, { token })
      const listBody3 = await listResp3.json()
      expect(listBody3.allocations).toHaveLength(0)
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-A11: Project-lines endpoint returns matched projects', async ({ request }) => {
    let invoiceId: string | null = null
    try {
      // Create invoice with B/L that may or may not match — test that endpoint works
      const result = await createInvoiceFixture(request, token, {
        blNumber: 'TESTBL999999',
        transportationMetadata: { bookingNumber: 'TESTBK999999' },
      })
      invoiceId = result.id

      const resp = await apiRequest(request, 'GET', `/api/fms_documents/invoices/${invoiceId}/project-lines`, { token })
      expect(resp.ok()).toBeTruthy()
      const body = await resp.json()
      expect(body.projects).toBeDefined()
      expect(Array.isArray(body.projects)).toBe(true)
      // Projects may be empty if no matching B/L — that's fine, we just verify the shape
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })
})

// ========================================
// Phase 2: UI Tests
// ========================================

test.describe('TC-FMS-DOC-016: Invoice Cost Management — UI', () => {
  test.setTimeout(40_000)

  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
  })

  test('016-U01: Verify invoice page renders with correct layout', async ({ page, request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      await login(page, 'superadmin')
      await page.goto(`/backend/fms-documents/invoices/${invoiceId}`)
      await page.waitForLoadState('domcontentloaded')

      // Tab bar should be visible
      await expect(page.getByText('1. Verify invoice')).toBeVisible()
      await expect(page.getByText('2. Allocate costs')).toBeVisible()

      // Extracted data heading
      await expect(page.getByText('Extracted data')).toBeVisible()

      // Seller/buyer cards
      await expect(page.getByText('Seller', { exact: true })).toBeVisible()
      await expect(page.getByText('Buyer', { exact: true })).toBeVisible()
      await expect(page.getByText('Test Seller Sp. z o.o.')).toBeVisible()
      await expect(page.getByText('Test Buyer S.A.')).toBeVisible()

      // Invoice type selector
      await expect(page.getByText('Invoice classification')).toBeVisible()
      await expect(page.getByText('Project cost')).toBeVisible()
      await expect(page.getByText('Company expense')).toBeVisible()

      // Line items table
      await expect(page.getByText('Line items')).toBeVisible()
      await expect(page.getByText('Ocean freight - FCL 40HC')).toBeVisible()

      // Action bar buttons
      await expect(page.getByRole('button', { name: /Reject/i })).toBeVisible()
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-U02: Selecting project_cost shows shipping details section', async ({ page, request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token, {
        blNumber: 'MAEU123456789',
        vesselName: 'MSC ANNA',
        voyageNumber: 'VY001W',
        transportationMetadata: {
          bookingNumber: 'BK-2026-001',
          portOfLoading: 'PLGDY',
          portOfDischarge: 'CNSHA',
        },
        containerNumbers: ['MAEU1234567', 'MAEU7654321'],
      })
      invoiceId = result.id

      await login(page, 'superadmin')
      await page.goto(`/backend/fms-documents/invoices/${invoiceId}`)
      await page.waitForLoadState('domcontentloaded')

      // Click "Project cost"
      await page.getByText('Project cost').click()

      // Shipping details should appear
      await expect(page.getByText('Shipping details')).toBeVisible()
      await expect(page.getByText('MAEU123456789')).toBeVisible()
      await expect(page.getByText('BK-2026-001')).toBeVisible()
      await expect(page.getByText('MSC ANNA / VY001W')).toBeVisible()

      // Containers should appear as badges
      await expect(page.getByText('MAEU1234567', { exact: true })).toBeVisible()
      await expect(page.getByText('MAEU7654321', { exact: true })).toBeVisible()
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-U03: Selecting company_expense shows expense category pills', async ({ page, request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      await login(page, 'superadmin')
      await page.goto(`/backend/fms-documents/invoices/${invoiceId}`)
      await page.waitForLoadState('domcontentloaded')

      // Click "Company expense"
      await page.getByText('Company expense').click()

      // Expense details should appear
      await expect(page.getByText('Expense details')).toBeVisible()
      await expect(page.getByText('telecom', { exact: true })).toBeVisible()
      await expect(page.getByText('insurance', { exact: true })).toBeVisible()
      await expect(page.getByText('office', { exact: true })).toBeVisible()
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-U04: Confirm as project_cost navigates to allocate page', async ({ page, request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      await login(page, 'superadmin')
      await page.goto(`/backend/fms-documents/invoices/${invoiceId}`)
      await page.waitForLoadState('domcontentloaded')

      // Select project cost
      await page.getByText('Project cost').click()

      // Click confirm
      await page.getByRole('button', { name: /Confirm & allocate/i }).click()

      // Should navigate to allocate page
      await page.waitForURL(/\/allocate/, { timeout: 10000 })
      await expect(page).toHaveURL(new RegExp(`/backend/fms-documents/invoices/${invoiceId}/allocate`))
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-U05: Allocate costs page renders with correct layout', async ({ page, request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      // Confirm first via API
      await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/confirm`, {
        token,
        data: { invoiceType: 'project_cost' },
      })

      await login(page, 'superadmin')
      await page.goto(`/backend/fms-documents/invoices/${invoiceId}/allocate`)
      await page.waitForLoadState('domcontentloaded')

      // Tab bar
      await expect(page.getByText('1. Verify invoice')).toBeVisible()
      await expect(page.getByText('2. Allocate costs')).toBeVisible()

      // Projects panel
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()

      // Invoice costs panel
      await expect(page.getByText('Invoice costs')).toBeVisible()

      // Instruction text
      await expect(page.getByText(/Select an offer line/)).toBeVisible()

      // Action bar
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: /Save allocation/i })).toBeVisible()

      // Invoice line should be visible
      await expect(page.getByText('Ocean freight - FCL 40HC')).toBeVisible()
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('016-U06: Back button on allocate page navigates to verify page', async ({ page, request }) => {
    let invoiceId: string | null = null
    try {
      const result = await createInvoiceFixture(request, token)
      invoiceId = result.id

      await apiRequest(request, 'POST', `/api/fms_documents/invoices/${invoiceId}/confirm`, {
        token,
        data: { invoiceType: 'project_cost' },
      })

      await login(page, 'superadmin')
      await page.goto(`/backend/fms-documents/invoices/${invoiceId}/allocate`)
      await page.waitForLoadState('domcontentloaded')

      await page.getByRole('button', { name: 'Back', exact: true }).click()

      // Client-side navigation — wait for URL change
      await expect(page).toHaveURL(new RegExp(`/backend/fms-documents/invoices/${invoiceId}(?:\\?.*)?$`), { timeout: 15000 })
    } finally {
      await deleteInvoiceIfExists(request, token, invoiceId)
    }
  })
})
