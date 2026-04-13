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

    expect(result.invoiceSize).toBe(Buffer.from(xml, 'utf8').length)

    const decoded = Buffer.from(result.encryptedInvoiceContent, 'base64').toString('utf8')
    expect(decoded).toBe(xml)

    const expectedHash = sha256HashBase64(Buffer.from(xml, 'utf8'))
    expect(result.invoiceHash).toBe(expectedHash)
  })

  it('prepares XML for submission (encrypted) and decrypts back', () => {
    const xml = buildFa3Xml(makeInvoice() as never, [makeLineItem()] as never[])
    const { key, iv } = generateAesKeyPair()

    const result = prepareInvoiceForSubmission(xml, key, iv)

    expect(result.encryptedInvoiceSize).toBeGreaterThan(0)

    const encryptedBody = Buffer.from(result.encryptedInvoiceContent, 'base64')
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

    const result = prepareInvoiceForSubmission(xml)
    expect(result.invoiceSize).toBeGreaterThan(0)
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

describe('buildFa3Xml — RodzajFaktury variants', () => {
  it('VAT — emits P_13_1 + P_14_1 for 23% standard rate', () => {
    const xml = buildFa3Xml(makeInvoice({ invoiceType: 'VAT' }) as never, [makeLineItem()] as never[])
    expect(xml).toContain('<RodzajFaktury>VAT</RodzajFaktury>')
    expect(xml).toContain('<P_13_1>1000.00</P_13_1>')
    expect(xml).toContain('<P_14_1>230.00</P_14_1>')
    // P_14_6_* slots do not exist in FA(3) v1-0E — guard against regression.
    expect(xml).not.toContain('<P_14_6_1>')
    expect(xml).not.toContain('<P_13_6_1>')
    expect(xml).not.toContain('<DaneFaKorygowanej>')
    expect(xml).not.toContain('<Zamowienie>')
    expect(xml).not.toContain('<FakturaZaliczkowa>')
  })

  it('emits P_13_6_1 (not P_13_1) when the line is explicitly 0% domestic', () => {
    const invoice = makeInvoice({ invoiceType: 'VAT' })
    const lineItems = [
      makeLineItem({
        vatRate: '0 KR',
        vatAmount: '0.00',
        netAmount: '1000.00',
      }),
    ]
    const xml = buildFa3Xml(invoice as never, lineItems as never[])
    expect(xml).toContain('<P_13_6_1>1000.00</P_13_6_1>')
    // 0 KR is net-only, no P_14 counterpart.
    expect(xml).not.toContain('<P_14_6_1>')
    expect(xml).toContain('<P_12>0 KR</P_12>')
  })

  it('routes 0 WDT to P_13_6_2 and 0 EX to P_13_6_3', () => {
    const xml = buildFa3Xml(makeInvoice({ invoiceType: 'VAT' }) as never, [
      makeLineItem({ lineNumber: 1, netAmount: '200.00', vatAmount: '0.00', vatRate: '0 WDT' }),
      makeLineItem({ lineNumber: 2, netAmount: '300.00', vatAmount: '0.00', vatRate: '0 EX' }),
    ] as never[])
    expect(xml).toContain('<P_13_6_2>200.00</P_13_6_2>')
    expect(xml).toContain('<P_13_6_3>300.00</P_13_6_3>')
    expect(xml).toContain('<P_12>0 WDT</P_12>')
    expect(xml).toContain('<P_12>0 EX</P_12>')
  })

  it('KOR — emits PrzyczynaKorekty/TypKorekty before DaneFaKorygowanej (NrKSeF choice)', () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR',
      correctedKsefNumber: '1234567890-20260301-ABCDEF-01',
      correctedInvoiceNumber: 'FV/2026/02/015',
      correctedInvoiceIssueDate: new Date('2026-03-01'),
      correctionReason: 'Mistake in quantity',
      correctionEffectType: 2,
      correctionPeriod: '2026-03',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])
    expect(xml).toContain('<RodzajFaktury>KOR</RodzajFaktury>')
    // Schema order: PrzyczynaKorekty + TypKorekty BEFORE DaneFaKorygowanej.
    const rodzaj = xml.indexOf('<RodzajFaktury>KOR</RodzajFaktury>')
    const przyczyna = xml.indexOf('<PrzyczynaKorekty>')
    const typKorekty = xml.indexOf('<TypKorekty>')
    const daneFa = xml.indexOf('<DaneFaKorygowanej>')
    const okresFa = xml.indexOf('<OkresFaKorygowanej>')
    expect(rodzaj).toBeGreaterThanOrEqual(0)
    expect(przyczyna).toBeGreaterThan(rodzaj)
    expect(typKorekty).toBeGreaterThan(przyczyna)
    expect(daneFa).toBeGreaterThan(typKorekty)
    expect(okresFa).toBeGreaterThan(daneFa)

    // DaneFaKorygowanej contents: DataWyst, NrFaKorygowanej, NrKSeF choice.
    expect(xml).toContain('<DaneFaKorygowanej>')
    expect(xml).toContain('<DataWystFaKorygowanej>2026-03-01</DataWystFaKorygowanej>')
    expect(xml).toContain('<NrFaKorygowanej>FV/2026/02/015</NrFaKorygowanej>')
    expect(xml).toContain('<NrKSeF>1</NrKSeF>')
    expect(xml).toContain('<NrKSeFFaKorygowanej>1234567890-20260301-ABCDEF-01</NrKSeFFaKorygowanej>')
    expect(xml).toContain('<PrzyczynaKorekty>Mistake in quantity</PrzyczynaKorekty>')
    expect(xml).toContain('<TypKorekty>2</TypKorekty>')
    expect(xml).toContain('<OkresFaKorygowanej>2026-03</OkresFaKorygowanej>')
  })

  it('KOR — pre-KSeF original uses NrKSeFN branch, not NrKSeF', () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR',
      correctedKsefNumber: null,
      correctedInvoiceNumber: 'FV/2025/12/042',
      correctionReason: 'Rebate',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])
    expect(xml).toContain('<NrFaKorygowanej>FV/2025/12/042</NrFaKorygowanej>')
    expect(xml).toContain('<NrKSeFN>1</NrKSeFN>')
    expect(xml).not.toContain('<NrKSeFFaKorygowanej>')
    expect(xml).not.toContain('<NrKSeF>1</NrKSeF>')
  })

  it('KOR — StanPrzed lines are written with opposite sign and flagged', () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR',
      correctedKsefNumber: '1234567890-20260301-ABCDEF-01',
      correctionReason: 'Corrected quantity',
    })
    const lineItems = [
      makeLineItem({
        lineNumber: 1,
        description: 'Before',
        netAmount: '1000.00',
        vatAmount: '230.00',
        isPreState: true,
      }),
      makeLineItem({
        lineNumber: 2,
        description: 'After',
        netAmount: '900.00',
        vatAmount: '207.00',
      }),
    ]
    const xml = buildFa3Xml(invoice as never, lineItems as never[])
    expect(xml).toContain('<P_11>-1000.00</P_11>')
    expect(xml).toContain('<P_11>900.00</P_11>')
    expect(xml).toContain('<StanPrzed>1</StanPrzed>')
    // Net grouping sums to -100 (pre-state subtracted). 23% lives in P_13_1.
    expect(xml).toContain('<P_13_1>-100.00</P_13_1>')
    expect(xml).toContain('<P_14_1>-23.00</P_14_1>')
  })

  it('ZAL — emits Zamowienie + WartoscZamowienia, P_15 = advanceAmount', () => {
    const invoice = makeInvoice({
      invoiceType: 'ZAL',
      advanceAmount: '600.00',
      orderTotalGross: '1230.00',
      grossAmount: '600.00',
    })
    const orderLines = [
      {
        lineNumber: 1,
        description: 'Transport Gdynia–Warszawa',
        unit: 'szt.',
        quantity: 1,
        netAmount: '1000.00',
        vatAmount: '230.00',
        vatRate: '23',
      },
    ]
    const xml = buildFa3Xml(invoice as never, [] as never[], { orderLines })
    expect(xml).toContain('<RodzajFaktury>ZAL</RodzajFaktury>')
    expect(xml).toContain('<Zamowienie>')
    expect(xml).toContain('<WartoscZamowienia>1230.00</WartoscZamowienia>')
    expect(xml).toContain('<NrWierszaZam>1</NrWierszaZam>')
    expect(xml).toContain('<P_7Z>Transport Gdynia–Warszawa</P_7Z>')
    expect(xml).toContain('<P_11NettoZ>1000.00</P_11NettoZ>')
    expect(xml).toContain('<P_11VatZ>230.00</P_11VatZ>')
    expect(xml).toContain('<P_12Z>23</P_12Z>')
    expect(xml).toContain('<P_15>600.00</P_15>')
    expect(xml).not.toContain('<FaWiersz>')
  })

  it('ZAL — final advance includes FakturaZaliczkowa refs', () => {
    const invoice = makeInvoice({
      invoiceType: 'ZAL',
      advanceAmount: '630.00',
      orderTotalGross: '1230.00',
      isFinalAdvance: true,
    })
    const xml = buildFa3Xml(invoice as never, [] as never[], {
      orderLines: [{
        lineNumber: 1,
        description: 'Order',
        quantity: 1,
        netAmount: '1000.00',
        vatAmount: '230.00',
        vatRate: '23',
      }],
      advanceRefs: [
        { ksefNumber: '1111-20260201-AAA-01', advanceAmount: '600.00', issueDate: new Date('2026-02-01') },
      ],
    })
    expect(xml).toContain('<FakturaZaliczkowa>')
    expect(xml).toContain('<NrKSeFFaZaliczkowej>1111-20260201-AAA-01</NrKSeFFaZaliczkowej>')
    // KwotaZaliczki and DataWystFaZaliczkowej do not exist in FA(3) v1-0E —
    // we keep them out of the XML even when the caller passes them.
    expect(xml).not.toContain('<KwotaZaliczki>')
    expect(xml).not.toContain('<DataWystFaZaliczkowej>')
  })

  it('ROZ — requires FakturaZaliczkowa refs and uses standard line items', () => {
    const invoice = makeInvoice({ invoiceType: 'ROZ' })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[], {
      advanceRefs: [
        { ksefNumber: '2222-20260301-BBB-02', advanceAmount: '615.00' },
        { invoiceNumber: 'FV/2026/03/007', advanceAmount: '615.00' },
      ],
    })
    expect(xml).toContain('<RodzajFaktury>ROZ</RodzajFaktury>')
    expect(xml).toContain('<NrKSeFFaZaliczkowej>2222-20260301-BBB-02</NrKSeFFaZaliczkowej>')
    expect(xml).toContain('<NrKSeFZN>1</NrKSeFZN>')
    expect(xml).toContain('<NrFaZaliczkowej>FV/2026/03/007</NrFaZaliczkowej>')
    expect(xml).toContain('<FaWiersz>')
  })

  it('UPR — buyer Nazwa and Adres are omitted (NIP-only)', () => {
    const invoice = makeInvoice({ invoiceType: 'UPR', grossAmount: '399.00' })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])
    expect(xml).toContain('<RodzajFaktury>UPR</RodzajFaktury>')
    // Buyer NIP still present
    expect(xml).toContain('<NIP>5261040828</NIP>')
    // But buyer name + address are suppressed on UPR
    expect(xml).not.toContain('<Nazwa>Kupiec S.A.</Nazwa>')
    expect(xml.match(/<Podmiot2>[\s\S]*?<\/Podmiot2>/)?.[0]).not.toContain('<Adres>')
  })

  it('KOR_ZAL — combines correction + order section', () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR_ZAL',
      advanceAmount: '500.00',
      orderTotalGross: '1230.00',
      correctedKsefNumber: '3333-20260201-CCC-03',
      correctionReason: 'Order quantity changed',
    })
    const xml = buildFa3Xml(invoice as never, [] as never[], {
      orderLines: [{
        lineNumber: 1,
        description: 'Updated order',
        quantity: 1,
        netAmount: '900.00',
        vatAmount: '207.00',
        vatRate: '23',
      }],
    })
    expect(xml).toContain('<RodzajFaktury>KOR_ZAL</RodzajFaktury>')
    expect(xml).toContain('<DaneFaKorygowanej>')
    expect(xml).toContain('<NrKSeFFaKorygowanej>3333-20260201-CCC-03</NrKSeFFaKorygowanej>')
    expect(xml).toContain('<Zamowienie>')
  })

  it('KOR_ROZ — combines correction + advance refs', () => {
    const invoice = makeInvoice({
      invoiceType: 'KOR_ROZ',
      correctedKsefNumber: '4444-20260301-DDD-04',
      correctionReason: 'Settlement adjustment',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[], {
      advanceRefs: [{ ksefNumber: '5555-20260201-EEE-05', advanceAmount: '600.00' }],
    })
    expect(xml).toContain('<RodzajFaktury>KOR_ROZ</RodzajFaktury>')
    expect(xml).toContain('<NrKSeFFaKorygowanej>4444-20260301-DDD-04</NrKSeFFaKorygowanej>')
    expect(xml).toContain('<NrKSeFFaZaliczkowej>5555-20260201-EEE-05</NrKSeFFaZaliczkowej>')
  })

  it('foreign currency — emits P_14_1W with PLN conversion', () => {
    const invoice = makeInvoice({
      currencyCode: 'EUR',
      exchangeRate: '4.3500',
      grossAmount: '123.00',
    })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])
    expect(xml).toContain('<KodWaluty>EUR</KodWaluty>')
    expect(xml).toContain('<P_14_1>230.00</P_14_1>')
    // 230.00 * 4.35 = 1000.50 in PLN
    expect(xml).toContain('<P_14_1W>1000.50</P_14_1W>')
  })

  it('Adnotacje — flags are driven by invoice data (split payment on)', () => {
    const invoice = makeInvoice({ annotSplitPayment: true, annotReverseCharge: true })
    const xml = buildFa3Xml(invoice as never, [makeLineItem()] as never[])
    expect(xml).toContain('<P_18>1</P_18>')
    expect(xml).toContain('<P_18A>1</P_18A>')
    expect(xml).toContain('<P_16>2</P_16>')
  })
})
