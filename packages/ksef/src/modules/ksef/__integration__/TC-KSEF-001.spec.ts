import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createKsefInvoiceFixture,
  deleteKsefInvoiceIfExists,
  getKsefInvoice,
} from './helpers/ksefFixtures'

/**
 * TC-KSEF-001: VAT — Standard invoice CRUD via API
 *
 * Verifies the baseline KSeF invoice flow: create a VAT invoice, read it
 * back, confirm type-specific fields round-trip, then delete.
 */
test.describe('TC-KSEF-001: VAT invoice CRUD via API', () => {
  test('creates, reads back, and deletes a VAT invoice', async ({ request }) => {
    let token: string | null = null
    let invoiceId: string | null = null

    try {
      token = await getAuthToken(request, 'admin')

      invoiceId = await createKsefInvoiceFixture(request, token, {
        invoiceType: 'VAT',
        buyerName: 'QA TC-KSEF-001 Buyer',
      })

      const invoice = await getKsefInvoice(request, token, invoiceId)
      expect(invoice.invoiceType).toBe('VAT')
      expect(invoice.buyerName).toBe('QA TC-KSEF-001 Buyer')
      expect(Array.isArray(invoice.lineItems)).toBeTruthy()
      expect((invoice.lineItems as unknown[]).length).toBeGreaterThanOrEqual(1)
      // VAT invoices should not have any Zamowienie / FakturaZaliczkowa rows
      expect((invoice.orderLines as unknown[] | undefined) ?? []).toEqual([])
      expect((invoice.advanceRefs as unknown[] | undefined) ?? []).toEqual([])

      const deleteResponse = await apiRequest(request, 'DELETE', `/api/ksef/invoices/${invoiceId}`, { token })
      expect(deleteResponse.ok(), 'DELETE should succeed').toBe(true)
      invoiceId = null
    } finally {
      await deleteKsefInvoiceIfExists(request, token, invoiceId)
    }
  })
})
