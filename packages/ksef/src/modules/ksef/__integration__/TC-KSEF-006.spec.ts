import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import { makeKsefInvoicePayload } from './helpers/ksefFixtures'

/**
 * TC-KSEF-006: Validator rejects malformed type-specific payloads
 *
 * Covers the per-type invariants end-to-end via the API — making sure the
 * zod schema hooked into POST /api/ksef/invoices rejects each category of
 * invalid payload with HTTP 400.
 */
test.describe('TC-KSEF-006: Type-specific validator rejections', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'admin')
  })

  test('KOR without correctionReason → 400', async ({ request }) => {
    const response = await apiRequest(request, 'POST', '/api/ksef/invoices', {
      token,
      data: makeKsefInvoicePayload({
        invoiceType: 'KOR',
        correctedKsefNumber: 'KSEF-123',
        // correctionReason missing
      }),
    })
    expect(response.status()).toBe(400)
  })

  test('KOR without any original reference → 400', async ({ request }) => {
    const response = await apiRequest(request, 'POST', '/api/ksef/invoices', {
      token,
      data: makeKsefInvoicePayload({
        invoiceType: 'KOR',
        correctionReason: 'missing-ref',
        // no correctedKsefNumber / correctedInvoiceNumber
      }),
    })
    expect(response.status()).toBe(400)
  })

  test('ZAL without order lines → 400', async ({ request }) => {
    const response = await apiRequest(request, 'POST', '/api/ksef/invoices', {
      token,
      data: makeKsefInvoicePayload({
        invoiceType: 'ZAL',
        advanceAmount: '500.00',
        orderTotalGross: '1230.00',
        orderLines: [], // empty
        lineItems: [],
      }),
    })
    expect(response.status()).toBe(400)
  })

  test('ZAL with advance > order total → 400', async ({ request }) => {
    const response = await apiRequest(request, 'POST', '/api/ksef/invoices', {
      token,
      data: makeKsefInvoicePayload({
        invoiceType: 'ZAL',
        advanceAmount: '2000.00',
        orderTotalGross: '1230.00',
        orderLines: [{ description: 'x', netAmount: '1000.00', vatAmount: '230.00', vatRate: '23' }],
        lineItems: [],
      }),
    })
    expect(response.status()).toBe(400)
  })

  test('ROZ without advance references → 400', async ({ request }) => {
    const response = await apiRequest(request, 'POST', '/api/ksef/invoices', {
      token,
      data: makeKsefInvoicePayload({
        invoiceType: 'ROZ',
        advanceRefs: [],
      }),
    })
    expect(response.status()).toBe(400)
  })
})
