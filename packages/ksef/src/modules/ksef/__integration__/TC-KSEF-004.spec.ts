import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createKsefInvoiceFixture,
  deleteKsefInvoiceIfExists,
  generateKsefInvoiceXml,
  getKsefInvoice,
} from './helpers/ksefFixtures'

/**
 * TC-KSEF-004: ROZ — Final settlement invoice with FakturaZaliczkowa refs
 *
 * Creates a ROZ that references two prior advance invoices (one KSeF-number
 * based, one legacy invoice-number based) and asserts that both are
 * persisted and emitted in the FA(3) XML.
 */
test.describe('TC-KSEF-004: ROZ invoice advance references', () => {
  test('persists advance refs and emits FakturaZaliczkowa blocks', async ({ request }) => {
    let token: string | null = null
    let invoiceId: string | null = null

    try {
      token = await getAuthToken(request, 'admin')

      const ksefRef = `2222-20260301-ROZ-${Date.now()}`
      invoiceId = await createKsefInvoiceFixture(request, token, {
        invoiceType: 'ROZ',
        advanceRefs: [
          { ksefNumber: ksefRef, advanceAmount: '615.00', issueDate: '2026-02-01' },
          { invoiceNumber: 'FV/2026/02/007', advanceAmount: '615.00' },
        ],
      })

      const invoice = await getKsefInvoice(request, token, invoiceId)
      expect(invoice.invoiceType).toBe('ROZ')
      const refs = (invoice.advanceRefs as Array<Record<string, unknown>>) ?? []
      expect(refs.length).toBe(2)

      const xml = await generateKsefInvoiceXml(request, token, invoiceId)
      expect(xml).toContain('<RodzajFaktury>ROZ</RodzajFaktury>')
      expect(xml).toContain(`<NrKSeFFaZaliczkowej>${ksefRef}</NrKSeFFaZaliczkowej>`)
      expect(xml).toContain('<NrKSeFZN>1</NrKSeFZN>')
      expect(xml).toContain('<NrFaZaliczkowej>FV/2026/02/007</NrFaZaliczkowej>')
    } finally {
      await deleteKsefInvoiceIfExists(request, token, invoiceId)
    }
  })
})
