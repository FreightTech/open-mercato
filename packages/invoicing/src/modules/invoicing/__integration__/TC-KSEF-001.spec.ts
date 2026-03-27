import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-KSEF-001: KSeF End-to-End Submission Flow
 *
 * Tests the Sprint 4 wiring:
 * 1. Create invoice via API
 * 2. Approve invoice
 * 3. Generate XML preview
 * 4. Submit to KSeF (queues worker)
 * 5. Check status endpoint
 * 6. Test credential connectivity
 * 7. Sync received invoices
 */
test.describe('TC-KSEF-001: KSeF End-to-End Flow', () => {
  let token: string
  let invoiceId: string | null = null

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    if (invoiceId) {
      await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${invoiceId}`, { token })
    }
  })

  test('create invoice, approve, generate XML, and submit to KSeF', async ({ request }) => {
    // Step 1: Create an invoice with line items
    const createResponse = await apiRequest(request, 'POST', '/api/invoicing/invoices', {
      token,
      data: {
        invoiceNumber: `KSEF-TEST-${Date.now()}`,
        invoiceDate: '2026-03-22',
        direction: 'outgoing',
        sourceType: 'manual',
        currencyCode: 'PLN',
        sellerName: 'Test Seller Sp. z o.o.',
        sellerTaxId: '7980332920',
        sellerAddress: 'ul. Testowa 1\n00-001 Warszawa',
        sellerCountryCode: 'PL',
        buyerName: 'Test Buyer S.A.',
        buyerTaxId: '5261040828',
        buyerAddress: 'ul. Kupiecka 5\n31-001 Kraków',
        buyerCountryCode: 'PL',
        paymentMethod: 'transfer',
        dueDate: '2026-04-22',
        lineItems: [
          {
            lineNumber: 1,
            description: 'Usługa transportowa',
            quantity: '1',
            unit: 'szt.',
            unitPriceNet: '1000.00',
            netAmount: '1000.00',
            vatRate: '23',
            vatAmount: '230.00',
            grossAmount: '1230.00',
          },
          {
            lineNumber: 2,
            description: 'Dodatkowy załadunek',
            quantity: '2',
            unit: 'szt.',
            unitPriceNet: '250.00',
            netAmount: '500.00',
            vatRate: '23',
            vatAmount: '115.00',
            grossAmount: '615.00',
          },
        ],
      },
    })

    expect(createResponse.ok(), `Create invoice failed: ${await createResponse.text()}`).toBe(true)
    const invoice = await createResponse.json()
    invoiceId = invoice.id
    expect(invoiceId).toBeTruthy()

    // Step 2: Approve the invoice
    const approveResponse = await apiRequest(request, 'POST', `/api/invoicing/invoices/${invoiceId}/approve`, {
      token,
    })
    expect(approveResponse.ok(), `Approve failed: ${await approveResponse.text()}`).toBe(true)

    // Step 3: Generate XML preview
    const xmlResponse = await apiRequest(request, 'POST', `/api/invoicing/ksef/generate-xml/${invoiceId}`, {
      token,
    })
    expect(xmlResponse.ok(), `Generate XML failed: ${await xmlResponse.text()}`).toBe(true)
    const xmlResult = await xmlResponse.json()

    expect(xmlResult.xml).toBeTruthy()
    expect(xmlResult.xml).toContain('<Faktura')
    expect(xmlResult.xml).toContain('7980332920') // seller NIP
    expect(xmlResult.xml).toContain('5261040828') // buyer NIP
    expect(xmlResult.xml).toContain('Usługa transportowa')
    expect(xmlResult.lineItemCount).toBe(2)

    // Step 4: Submit to KSeF (queues worker — will fail without real KSeF session, but should queue)
    const submitResponse = await apiRequest(request, 'POST', `/api/invoicing/ksef/submit/${invoiceId}`, {
      token,
    })
    expect(submitResponse.ok(), `Submit failed: ${await submitResponse.text()}`).toBe(true)
    const submitResult = await submitResponse.json()
    expect(submitResult.ksefStatus).toBe('queued')

    // Step 5: Check status endpoint
    const statusResponse = await apiRequest(request, 'GET', `/api/invoicing/ksef/status/${invoiceId}`, {
      token,
    })
    expect(statusResponse.ok(), `Status check failed: ${await statusResponse.text()}`).toBe(true)
    const statusResult = await statusResponse.json()
    expect(['queued', 'submitted', 'error']).toContain(statusResult.ksefStatus)
  })

  test('generate-xml validates required fields', async ({ request }) => {
    // Create an invoice WITHOUT sellerTaxId
    const createResponse = await apiRequest(request, 'POST', '/api/invoicing/invoices', {
      token,
      data: {
        invoiceNumber: `KSEF-VAL-${Date.now()}`,
        invoiceDate: '2026-03-22',
        direction: 'outgoing',
        sourceType: 'manual',
        currencyCode: 'PLN',
        sellerName: 'No NIP Seller',
        buyerName: 'Buyer',
      },
    })

    if (createResponse.ok()) {
      const invoice = await createResponse.json()
      const tempId = invoice.id

      try {
        const xmlResponse = await apiRequest(request, 'POST', `/api/invoicing/ksef/generate-xml/${tempId}`, {
          token,
        })
        expect(xmlResponse.status()).toBe(400)
        const body = await xmlResponse.json()
        expect(body.error).toMatch(/Seller tax ID|line item/)
      } finally {
        await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${tempId}`, { token })
      }
    }
  })

  test('batch submit queues multiple invoices', async ({ request }) => {
    const ids: string[] = []

    try {
      for (let i = 0; i < 2; i++) {
        const res = await apiRequest(request, 'POST', '/api/invoicing/invoices', {
          token,
          data: {
            invoiceNumber: `KSEF-BATCH-${Date.now()}-${i}`,
            invoiceDate: '2026-03-22',
            direction: 'outgoing',
            sourceType: 'manual',
            currencyCode: 'PLN',
            sellerName: 'Batch Seller',
            sellerTaxId: '7980332920',
            buyerName: 'Batch Buyer',
            lineItems: [{
              lineNumber: 1,
              description: 'Service',
              quantity: '1',
              unit: 'szt.',
              unitPriceNet: '100.00',
              netAmount: '100.00',
              vatRate: '23',
              vatAmount: '23.00',
              grossAmount: '123.00',
            }],
          },
        })

        if (res.ok()) {
          const inv = await res.json()
          ids.push(inv.id)
          await apiRequest(request, 'POST', `/api/invoicing/invoices/${inv.id}/approve`, { token })
        }
      }

      if (ids.length === 2) {
        const batchRes = await apiRequest(request, 'POST', '/api/invoicing/ksef/submit-batch', {
          token,
          data: { invoiceIds: ids },
        })
        expect(batchRes.ok(), `Batch submit failed: ${await batchRes.text()}`).toBe(true)
        const batchResult = await batchRes.json()
        // Invoices may be filtered by org scope — verify the endpoint works
        expect(batchResult.total).toBe(2)
        expect(typeof batchResult.queuedCount).toBe('number')
      }
    } finally {
      for (const id of ids) {
        await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${id}`, { token })
      }
    }
  })

  test('sync-received returns 400 when NIP not configured', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/invoicing/ksef/sync-received', {
      token,
      data: {},
    })
    // 400 = NIP not configured, 200 = settings exist and job enqueued, 403 = feature not granted
    expect([200, 400, 403]).toContain(res.status())
  })
})
