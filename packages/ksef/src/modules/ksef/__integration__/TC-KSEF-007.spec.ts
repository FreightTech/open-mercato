import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createKsefInvoiceFixture,
  deleteKsefInvoiceIfExists,
  generateKsefInvoiceXml,
} from './helpers/ksefFixtures'

/**
 * TC-KSEF-007: XML preview emits P_14_* totals + Adnotacje reflect flags
 *
 * Covers two builder concerns that are easy to regress:
 *   1. FA(3) XML must include both P_13_* (net per rate) and P_14_*
 *      (VAT per rate) totals grouped from line items.
 *   2. The Adnotacje block must mirror the stored flag columns —
 *      setting split-payment on the invoice must flip <P_18A> to 1.
 */
test.describe('TC-KSEF-007: XML builder totals + Adnotacje flags', () => {
  test('emits P_13/P_14 totals and propagates split-payment flag', async ({ request }) => {
    let token: string | null = null
    let invoiceId: string | null = null

    try {
      token = await getAuthToken(request, 'admin')

      invoiceId = await createKsefInvoiceFixture(request, token, {
        invoiceType: 'VAT',
        annotSplitPayment: true,
        lineItems: [
          {
            description: 'QA TC-KSEF-007 line',
            unitPriceNet: '1000.00',
            netAmount: '1000.00',
            vatAmount: '230.00',
            vatRate: '23',
          },
        ],
      })

      const xml = await generateKsefInvoiceXml(request, token, invoiceId)
      // 23% → P_13_1 + P_14_1 per FA(3) v1-0E.
      expect(xml).toContain('<P_13_1>1000.00</P_13_1>')
      expect(xml).toContain('<P_14_1>230.00</P_14_1>')
      // Guard against the pre-fix mapping regressing.
      expect(xml).not.toContain('<P_14_6_1>')
      // Split payment flag mirrored into Adnotacje
      expect(xml).toContain('<P_18A>1</P_18A>')
    } finally {
      await deleteKsefInvoiceIfExists(request, token, invoiceId)
    }
  })
})
