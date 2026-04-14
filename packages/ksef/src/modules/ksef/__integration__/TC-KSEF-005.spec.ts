import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createKsefInvoiceFixture,
  deleteKsefInvoiceIfExists,
  generateKsefInvoiceXml,
  makeKsefInvoicePayload,
} from './helpers/ksefFixtures'

/**
 * TC-KSEF-005: UPR — Simplified invoice
 *
 * Verifies UPR-specific invariants:
 *   1. Gross ≤ 450 PLN is accepted; > 450 is rejected with 400.
 *   2. A valid UPR generates XML where Podmiot2 keeps NIP but drops
 *      Nazwa + Adres (the UPR simplification).
 */
test.describe('TC-KSEF-005: UPR gross cap + simplified buyer block', () => {
  test('accepts UPR at cap and produces simplified buyer XML', async ({ request }) => {
    let token: string | null = null
    let invoiceId: string | null = null

    try {
      token = await getAuthToken(request, 'admin')

      invoiceId = await createKsefInvoiceFixture(request, token, {
        invoiceType: 'UPR',
        netAmount: '365.85',
        vatAmount: '84.15',
        grossAmount: '450.00',
        lineItems: [
          {
            description: 'QA TC-KSEF-005 small service',
            unitPriceNet: '365.85',
            netAmount: '365.85',
            vatAmount: '84.15',
          },
        ],
      })

      const xml = await generateKsefInvoiceXml(request, token, invoiceId)
      expect(xml).toContain('<RodzajFaktury>UPR</RodzajFaktury>')
      // Buyer NIP must still be present
      expect(xml).toContain('<NIP>5261040828</NIP>')
      // Buyer name + address suppressed on UPR
      const podmiot2 = xml.match(/<Podmiot2>[\s\S]*?<\/Podmiot2>/)?.[0] ?? ''
      expect(podmiot2).not.toContain('<Nazwa>')
      expect(podmiot2).not.toContain('<Adres>')
    } finally {
      await deleteKsefInvoiceIfExists(request, token, invoiceId)
    }
  })

  test('rejects UPR when gross exceeds 450 PLN', async ({ request }) => {
    const token = await getAuthToken(request, 'admin')
    const response = await apiRequest(request, 'POST', '/api/ksef/invoices', {
      token,
      data: makeKsefInvoicePayload({
        invoiceType: 'UPR',
        grossAmount: '451.00',
      }),
    })
    expect(response.status()).toBe(400)
  })

  test('rejects UPR in a foreign currency', async ({ request }) => {
    const token = await getAuthToken(request, 'admin')
    const response = await apiRequest(request, 'POST', '/api/ksef/invoices', {
      token,
      data: makeKsefInvoicePayload({
        invoiceType: 'UPR',
        currencyCode: 'EUR',
        grossAmount: '100.00',
      }),
    })
    expect(response.status()).toBe(400)
  })
})
