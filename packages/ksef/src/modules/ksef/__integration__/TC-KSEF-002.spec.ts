import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createKsefInvoiceFixture,
  deleteKsefInvoiceIfExists,
  generateKsefInvoiceXml,
  getKsefInvoice,
} from './helpers/ksefFixtures'

/**
 * TC-KSEF-002: KOR — Corrective invoice with DaneFaKorygowanej
 *
 * Creates a KOR with the full correction metadata block and asserts:
 *   1. Persistence round-trips correction_* columns.
 *   2. FA(3) XML emits DaneFaKorygowanej, PrzyczynaKorekty, TypKorekty,
 *      OkresFaKorygowanej.
 */
test.describe('TC-KSEF-002: KOR invoice correction metadata', () => {
  test('persists correction fields and emits DaneFaKorygowanej in XML', async ({ request }) => {
    let token: string | null = null
    let invoiceId: string | null = null

    try {
      token = await getAuthToken(request, 'admin')

      const correctedKsefNumber = `1234567890-20260301-TEST-${Date.now()}`
      invoiceId = await createKsefInvoiceFixture(request, token, {
        invoiceType: 'KOR',
        correctedKsefNumber,
        correctedInvoiceIssueDate: '2026-03-01',
        correctionReason: 'QA TC-KSEF-002: quantity corrected',
        correctionEffectType: 2,
        correctionPeriod: '2026-03',
      })

      const invoice = await getKsefInvoice(request, token, invoiceId)
      expect(invoice.invoiceType).toBe('KOR')
      expect(invoice.correctedKsefNumber).toBe(correctedKsefNumber)
      expect(invoice.correctionReason).toContain('QA TC-KSEF-002')
      expect(invoice.correctionEffectType).toBe(2)
      expect(invoice.correctionPeriod).toBe('2026-03')

      const xml = await generateKsefInvoiceXml(request, token, invoiceId)
      expect(xml).toContain('<RodzajFaktury>KOR</RodzajFaktury>')
      expect(xml).toContain('<DaneFaKorygowanej>')
      expect(xml).toContain(`<NrKSeFFaKorygowanej>${correctedKsefNumber}</NrKSeFFaKorygowanej>`)
      expect(xml).toContain('<DataWystFaKorygowanej>2026-03-01</DataWystFaKorygowanej>')
      expect(xml).toContain('<PrzyczynaKorekty>QA TC-KSEF-002: quantity corrected</PrzyczynaKorekty>')
      expect(xml).toContain('<TypKorekty>2</TypKorekty>')
      expect(xml).toContain('<OkresFaKorygowanej>2026-03</OkresFaKorygowanej>')
    } finally {
      await deleteKsefInvoiceIfExists(request, token, invoiceId)
    }
  })
})
