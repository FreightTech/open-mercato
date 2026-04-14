/** @jest-environment node */
import { buildFa3Xml } from '../xml-builder'
import { assertFa3XmlValid } from './fa3-xsd.helper'

jest.setTimeout(30_000)

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: 'FV/2026/03/001',
    invoiceDate: new Date('2026-03-22'),
    serviceDate: null,
    dueDate: new Date('2026-04-22'),
    currencyCode: 'PLN',
    netAmount: '1500.00',
    vatAmount: '345.00',
    grossAmount: '1845.00',
    sellerName: 'Test Spółka z o.o.',
    sellerTaxId: '7980332920',
    sellerAddress: 'ul. Testowa 1\n00-001 Warszawa',
    sellerCountryCode: 'PL',
    sellerBankAccount: 'PL61 1090 1014 0000 0712 1981 2874',
    buyerName: 'Kupiec S.A.',
    buyerTaxId: '5261040828',
    buyerAddress: 'ul. Handlowa 5\n31-001 Kraków',
    buyerCountryCode: 'PL',
    paymentMethod: 'transfer',
    ...overrides,
  }
}

function makeLineItem(overrides: Record<string, unknown> = {}) {
  return {
    lineNumber: 1,
    description: 'Usługa transportowa',
    quantity: 1,
    unit: 'szt.',
    unitPriceNet: '1000.00',
    netAmount: '1000.00',
    vatRate: '23',
    vatRateCode: null,
    vatAmount: '230.00',
    gtuCode: null,
    ...overrides,
  }
}

describe('buildFa3Xml — XSD validation against schemat_FA(3)_v1-0E.xsd', () => {
  it('standard VAT invoice validates against the real schema', async () => {
    const xml = buildFa3Xml(makeInvoice() as never, [makeLineItem()] as never[])
    await assertFa3XmlValid(xml)
  })

  it('multi-rate VAT invoice (23% + 8% + 5% + 0 KR + zw) validates', async () => {
    const lineItems = [
      makeLineItem({ lineNumber: 1, netAmount: '1000.00', vatAmount: '230.00', vatRate: '23' }),
      makeLineItem({ lineNumber: 2, netAmount: '500.00',  vatAmount: '40.00',  vatRate: '8' }),
      makeLineItem({ lineNumber: 3, netAmount: '200.00',  vatAmount: '10.00',  vatRate: '5' }),
      makeLineItem({ lineNumber: 4, netAmount: '100.00',  vatAmount: '0.00',   vatRate: '0 KR' }),
      makeLineItem({ lineNumber: 5, netAmount: '50.00',   vatAmount: '0.00',   vatRate: 'zw' }),
    ]
    const invoice = makeInvoice({ grossAmount: '2130.00' })
    const xml = buildFa3Xml(invoice as never, lineItems as never[])
    await assertFa3XmlValid(xml)
  })

  it('KOR with KSeF reference validates', async () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR',
      // KSeF number format: NIP-YYYYMMDD-12 hex chars-2 hex checksum
      correctedKsefNumber: '7980332920-20260228-ABCDEFABCDEF-A1',
      correctedInvoiceNumber: 'FV/2026/02/015',
      correctedInvoiceIssueDate: new Date('2026-02-28'),
      correctionReason: 'Błędna ilość',
      correctionEffectType: 2,
      correctionPeriod: '2026-02',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])
    await assertFa3XmlValid(xml)
  })

  it('KOR for a pre-KSeF original validates (NrKSeFN branch)', async () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR',
      correctedKsefNumber: null,
      correctedInvoiceNumber: 'FV/2025/12/042',
      correctedInvoiceIssueDate: new Date('2025-12-10'),
      correctionReason: 'Rabat',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])
    await assertFa3XmlValid(xml)
  })

  it('ZAL with Zamowienie validates', async () => {
    const invoice = makeInvoice({
      invoiceType: 'ZAL',
      grossAmount: '600.00',
      advanceAmount: '600.00',
      orderTotalGross: '1230.00',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[], {
      orderLines: [
        {
          lineNumber: 1,
          description: 'Transport Gdynia–Warszawa',
          unit: 'szt.',
          quantity: 1,
          netAmount: '1000.00',
          vatAmount: '230.00',
          vatRate: '23',
        },
      ],
    })
    await assertFa3XmlValid(xml)
  })

  it('ROZ with FakturaZaliczkowa references validates', async () => {
    const invoice = makeInvoice({ invoiceType: 'ROZ' })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[], {
      advanceRefs: [
        { ksefNumber: '7980332920-20260201-BBBBBBBBBBBB-B2' },
        { invoiceNumber: 'FV/2026/02/007' },
      ],
    })
    await assertFa3XmlValid(xml)
  })

  it('UPR at the 450 PLN cap validates', async () => {
    const invoice = makeInvoice({
      invoiceType: 'UPR',
      grossAmount: '450.00',
      netAmount: '365.85',
      vatAmount: '84.15',
    })
    const lineItems = [
      makeLineItem({
        netAmount: '365.85',
        unitPriceNet: '365.85',
        vatAmount: '84.15',
        vatRate: '23',
      }),
    ]
    const xml = buildFa3Xml(invoice as never, lineItems as never[])
    await assertFa3XmlValid(xml)
  })

  it('foreign-currency invoice with P_14_1W validates', async () => {
    const invoice = makeInvoice({
      currencyCode: 'EUR',
      exchangeRate: '4.3500',
      grossAmount: '1230.00',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])
    await assertFa3XmlValid(xml)
  })

  it('KOR_ZAL combines correction + Zamowienie and validates', async () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR_ZAL',
      advanceAmount: '500.00',
      orderTotalGross: '1230.00',
      grossAmount: '500.00',
      correctedKsefNumber: '7980332920-20260201-CCCCCCCCCCCC-C3',
      correctedInvoiceNumber: 'FV/2026/02/001',
      correctedInvoiceIssueDate: new Date('2026-02-01'),
      correctionReason: 'Zmiana ilości w zamówieniu',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[], {
      orderLines: [
        {
          lineNumber: 1,
          description: 'Updated order',
          unit: 'szt.',
          quantity: 1,
          netAmount: '900.00',
          vatAmount: '207.00',
          vatRate: '23',
        },
      ],
    })
    await assertFa3XmlValid(xml)
  })

  it('KOR_ROZ combines correction + FakturaZaliczkowa refs and validates', async () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR_ROZ',
      correctedKsefNumber: '7980332920-20260301-DDDDDDDDDDDD-D4',
      correctedInvoiceNumber: 'FV/2026/03/010',
      correctedInvoiceIssueDate: new Date('2026-03-01'),
      correctionReason: 'Korekta rozliczenia końcowego',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[], {
      advanceRefs: [{ ksefNumber: '7980332920-20260201-EEEEEEEEEEEE-E5' }],
    })
    await assertFa3XmlValid(xml)
  })
})
