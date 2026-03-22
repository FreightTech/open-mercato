/** @jest-environment node */
import { buildFa3Xml } from '../xml-builder'
import { prepareInvoiceForSubmission, generateAesKeyPair, decryptAes256Cbc, sha256HashBase64 } from '../crypto'

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
    grossAmount: '1230.00',
    gtuCode: null,
    pkwiuCode: null,
    ...overrides,
  }
}

describe('buildFa3Xml + prepareInvoiceForSubmission integration', () => {
  it('generates valid FA(3) XML with correct structure', () => {
    const invoice = makeInvoice()
    const lineItems = [
      makeLineItem(),
      makeLineItem({
        lineNumber: 2,
        description: 'Załadunek & rozładunek',
        quantity: 2,
        unitPriceNet: '250.00',
        netAmount: '500.00',
        vatRate: '23',
        vatAmount: '115.00',
        grossAmount: '615.00',
      }),
    ]

    const xml = buildFa3Xml(invoice as never, lineItems as never[])

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<Faktura xmlns=')
    expect(xml).toContain('<Naglowek>')
    expect(xml).toContain('<KodFormularza')
    expect(xml).toContain('<Podmiot1>')
    expect(xml).toContain('<NIP>7980332920</NIP>')
    expect(xml).toContain('<Podmiot2>')
    expect(xml).toContain('<NIP>5261040828</NIP>')
    expect(xml).toContain('<Fa>')
    expect(xml).toContain('<KodWaluty>PLN</KodWaluty>')
    expect(xml).toContain('<P_2>FV/2026/03/001</P_2>')
    expect(xml).toContain('<FaWiersz>')
    expect(xml).toContain('<P_7>Usługa transportowa</P_7>')
    expect(xml).toContain('Załadunek &amp; rozładunek')
    expect(xml).toContain('<NrWierszaFa>1</NrWierszaFa>')
    expect(xml).toContain('<NrWierszaFa>2</NrWierszaFa>')
    expect(xml).toContain('</Faktura>')
  })

  it('prepares XML for submission (plaintext)', () => {
    const xml = buildFa3Xml(makeInvoice() as never, [makeLineItem()] as never[])
    const result = prepareInvoiceForSubmission(xml)

    expect(result.encrypted).toBe(false)
    expect(result.fileSize).toBe(Buffer.from(xml, 'utf8').length)

    const decoded = Buffer.from(result.invoiceBody, 'base64').toString('utf8')
    expect(decoded).toBe(xml)

    const expectedHash = sha256HashBase64(Buffer.from(xml, 'utf8'))
    expect(result.hashValue).toBe(expectedHash)
  })

  it('prepares XML for submission (encrypted) and decrypts back', () => {
    const xml = buildFa3Xml(makeInvoice() as never, [makeLineItem()] as never[])
    const { key, iv } = generateAesKeyPair()

    const result = prepareInvoiceForSubmission(xml, key, iv)

    expect(result.encrypted).toBe(true)

    const encryptedBody = Buffer.from(result.invoiceBody, 'base64')
    const decrypted = decryptAes256Cbc(encryptedBody, key, iv)
    expect(decrypted).toBe(xml)
  })

  it('handles special characters in XML (ampersand, quotes, Polish chars)', () => {
    const invoice = makeInvoice({
      sellerName: 'Firma "Żółw & Ćma" Sp. z o.o.',
      buyerName: "Buyer's <Company>",
    })
    const lineItems = [makeLineItem({ description: 'Usługa "specjalna" z VAT & marżą' })]

    const xml = buildFa3Xml(invoice as never, lineItems as never[])

    expect(xml).toContain('Firma &quot;Żółw &amp; Ćma&quot; Sp. z o.o.')
    expect(xml).toContain('Buyer&apos;s &lt;Company&gt;')
    expect(xml).toContain('Usługa &quot;specjalna&quot; z VAT &amp; marżą')

    // Ensure it can still be prepared for submission
    const result = prepareInvoiceForSubmission(xml)
    expect(result.fileSize).toBeGreaterThan(0)
  })

  it('handles EU buyer (non-PL country code)', () => {
    const invoice = makeInvoice({
      buyerCountryCode: 'DE',
      buyerTaxId: 'DE123456789',
    })

    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])

    expect(xml).toContain('<KodUE>DE</KodUE>')
    expect(xml).toContain('<NrVatUE>DE123456789</NrVatUE>')
    expect(xml).not.toContain('<NIP>DE123456789</NIP>')
  })
})
