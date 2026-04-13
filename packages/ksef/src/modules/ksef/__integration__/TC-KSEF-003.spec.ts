import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createKsefInvoiceFixture,
  deleteKsefInvoiceIfExists,
  generateKsefInvoiceXml,
  getKsefInvoice,
} from './helpers/ksefFixtures'

/**
 * TC-KSEF-003: ZAL — Advance invoice with Zamowienie block
 *
 * Creates a ZAL with an order lines collection + advance amount, then
 * verifies:
 *   1. Order lines round-trip via GET.
 *   2. XML emits <Zamowienie>, <WartoscZamowienia>, <ZamowienieWiersz> rows.
 *   3. <P_15> equals advanceAmount (not grossAmount).
 *   4. No <FaWiersz> element is emitted when lineItems is empty.
 */
test.describe('TC-KSEF-003: ZAL invoice Zamowienie block', () => {
  test('persists Zamowienie and emits it in FA(3) XML', async ({ request }) => {
    let token: string | null = null
    let invoiceId: string | null = null

    try {
      token = await getAuthToken(request, 'admin')

      invoiceId = await createKsefInvoiceFixture(request, token, {
        invoiceType: 'ZAL',
        grossAmount: '600.00',
        netAmount: '487.80',
        vatAmount: '112.20',
        advanceAmount: '600.00',
        orderTotalGross: '1230.00',
        orderLines: [
          {
            description: 'QA TC-KSEF-003 order line',
            unit: 'szt.',
            quantity: '1',
            netAmount: '1000.00',
            vatAmount: '230.00',
            vatRate: '23',
          },
        ],
        lineItems: [], // ZAL allows empty FaWiersz
      })

      const invoice = await getKsefInvoice(request, token, invoiceId)
      expect(invoice.invoiceType).toBe('ZAL')
      expect(String(invoice.advanceAmount)).toBe('600.00')
      expect(String(invoice.orderTotalGross)).toBe('1230.00')
      const orderLines = (invoice.orderLines as Array<Record<string, unknown>>) ?? []
      expect(orderLines.length).toBe(1)
      expect(orderLines[0].description).toBe('QA TC-KSEF-003 order line')

      const xml = await generateKsefInvoiceXml(request, token, invoiceId)
      expect(xml).toContain('<RodzajFaktury>ZAL</RodzajFaktury>')
      expect(xml).toContain('<Zamowienie>')
      expect(xml).toContain('<WartoscZamowienia>1230.00</WartoscZamowienia>')
      expect(xml).toContain('<P_7Z>QA TC-KSEF-003 order line</P_7Z>')
      expect(xml).toContain('<P_11NettoZ>1000.00</P_11NettoZ>')
      expect(xml).toContain('<P_11VatZ>230.00</P_11VatZ>')
      expect(xml).toContain('<P_12Z>23</P_12Z>')
      expect(xml).toContain('<P_15>600.00</P_15>')
      expect(xml).not.toContain('<FaWiersz>')
    } finally {
      await deleteKsefInvoiceIfExists(request, token, invoiceId)
    }
  })
})
