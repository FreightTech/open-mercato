import { test, expect, type APIRequestContext } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'

/**
 * TC-KSEF-XML-VALIDATION: FA(3) XML Generation — Various Invoice Configurations
 *
 * Tests XML generation correctness for:
 * 1. Standard domestic invoice (PL buyer with NIP, 23% VAT)
 * 2. Multi-rate invoice (23% + 8% + 5%)
 * 3. Exempt invoice (zw rate)
 * 4. EU buyer (KodUE + NrVatUE instead of NIP)
 * 5. Missing seller NIP → 400 error
 * 6. No line items → 400 error
 */
test.describe('TC-KSEF-XML-VALIDATION: FA(3) XML Generation', () => {
  let token: string
  const createdInvoiceIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'superadmin')
  })

  test.afterAll(async ({ request }) => {
    for (const id of createdInvoiceIds) {
      await apiRequest(request, 'DELETE', `/api/invoicing/invoices/${id}`, { token }).catch(() => {})
    }
  })

  async function createInvoice(
    request: APIRequestContext,
    data: Record<string, unknown>,
  ): Promise<{ id: string; [key: string]: unknown }> {
    const timestamp = Date.now()
    const defaults = {
      invoiceNumber: `XML-TEST-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      direction: 'outgoing' as const,
      sourceType: 'manual' as const,
      currencyCode: 'PLN',
      paymentMethod: 'transfer',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    }

    const response = await apiRequest(request, 'POST', '/api/invoicing/invoices', {
      token,
      data: { ...defaults, ...data },
    })

    expect(response.ok(), `Create invoice failed: ${await response.text()}`).toBe(true)
    const invoice = await response.json()
    createdInvoiceIds.push(invoice.id)
    return invoice
  }

  async function generateXml(
    request: APIRequestContext,
    invoiceId: string,
  ): Promise<{ xml: string; lineItemCount: number }> {
    const response = await apiRequest(request, 'POST', `/api/invoicing/ksef/generate-xml/${invoiceId}`, {
      token,
    })
    expect(response.ok(), `Generate XML failed: ${await response.text()}`).toBe(true)
    return await response.json()
  }

  test('standard domestic invoice — PL buyer with NIP, 23% VAT', async ({ request }) => {
    const invoice = await createInvoice(request, {
      sellerName: 'Seller Sp. z o.o.',
      sellerTaxId: '7451834739',
      sellerAddress: 'ul. Testowa 1\n00-001 Warszawa',
      sellerCountryCode: 'PL',
      buyerName: 'Buyer S.A.',
      buyerTaxId: '5213842879',
      buyerAddress: 'ul. Kupiecka 5\n31-001 Kraków',
      buyerCountryCode: 'PL',
      lineItems: [
        {
          lineNumber: 1,
          description: 'Transport krajowy',
          quantity: '3',
          unit: 'szt.',
          unitPriceNet: '500.00',
          netAmount: '1500.00',
          vatRate: '23',
          vatRateCode: '23',
          vatAmount: '345.00',
          grossAmount: '1845.00',
        },
      ],
    })

    const result = await generateXml(request, invoice.id)
    const xml = result.xml

    // Root element and encoding
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<Faktura')

    // Header
    expect(xml).toContain('<Naglowek>')
    expect(xml).toContain('<KodFormularza')
    expect(xml).toContain('<WariantFormularza>3</WariantFormularza>')

    // Seller (Podmiot1) — Polish company with NIP
    expect(xml).toContain('<Podmiot1>')
    expect(xml).toContain('<NIP>7451834739</NIP>')
    expect(xml).toContain('<Nazwa>Seller Sp. z o.o.</Nazwa>')
    expect(xml).toContain('<KodKraju>PL</KodKraju>')
    expect(xml).toContain('<AdresL1>ul. Testowa 1</AdresL1>')

    // Buyer (Podmiot2) — Polish company with NIP
    expect(xml).toContain('<Podmiot2>')
    expect(xml).toContain('<NIP>5213842879</NIP>')
    expect(xml).toContain('<Nazwa>Buyer S.A.</Nazwa>')

    // Invoice data
    expect(xml).toContain('<KodWaluty>PLN</KodWaluty>')
    expect(xml).toContain(`<P_2>${invoice.invoiceNumber}</P_2>`)

    // VAT group: 23% — net=1500, vat=345
    expect(xml).toContain('<P_13_1>1500.00</P_13_1>')
    expect(xml).toContain('<P_14_1>345.00</P_14_1>')
    expect(xml).toContain('<P_15>1845.00</P_15>')

    // Line item
    expect(result.lineItemCount).toBe(1)
    expect(xml).toContain('<NrWierszaFa>1</NrWierszaFa>')
    expect(xml).toContain('<P_7>Transport krajowy</P_7>')
    expect(xml).toContain('<P_8A>szt.</P_8A>')
    expect(xml).toContain('<P_8B>3</P_8B>')
    expect(xml).toContain('<P_9A>500.00</P_9A>')
    expect(xml).toContain('<P_11>1500.00</P_11>')
    expect(xml).toContain('<P_12>23</P_12>')

    // Payment
    expect(xml).toContain('<FormaPlatnosci>6</FormaPlatnosci>')

    // Adnotacje — no exemption
    expect(xml).toContain('<Adnotacje>')
    expect(xml).toContain('<P_19N>1</P_19N>')

    // Closing tag
    expect(xml).toContain('</Faktura>')
  })

  test('multi-rate invoice — 23% + 8% + 5%', async ({ request }) => {
    const invoice = await createInvoice(request, {
      sellerName: 'Multi-Rate Seller Sp. z o.o.',
      sellerTaxId: '7451834739',
      sellerAddress: 'ul. Stawkowa 10\n00-001 Warszawa',
      sellerCountryCode: 'PL',
      buyerName: 'Multi-Rate Buyer',
      buyerTaxId: '5213842879',
      buyerAddress: 'ul. Kupiecka 5\n31-001 Kraków',
      buyerCountryCode: 'PL',
      lineItems: [
        {
          lineNumber: 1,
          description: 'Usługa transportowa (23%)',
          quantity: '1',
          unit: 'szt.',
          unitPriceNet: '1000.00',
          netAmount: '1000.00',
          vatRate: '23',
          vatRateCode: '23',
          vatAmount: '230.00',
          grossAmount: '1230.00',
        },
        {
          lineNumber: 2,
          description: 'Usługa budowlana (8%)',
          quantity: '1',
          unit: 'szt.',
          unitPriceNet: '2000.00',
          netAmount: '2000.00',
          vatRate: '8',
          vatRateCode: '8',
          vatAmount: '160.00',
          grossAmount: '2160.00',
        },
        {
          lineNumber: 3,
          description: 'Żywność (5%)',
          quantity: '10',
          unit: 'kg',
          unitPriceNet: '50.00',
          netAmount: '500.00',
          vatRate: '5',
          vatRateCode: '5',
          vatAmount: '25.00',
          grossAmount: '525.00',
        },
      ],
    })

    const result = await generateXml(request, invoice.id)
    const xml = result.xml

    expect(result.lineItemCount).toBe(3)

    // 23% rate group: P_13_1 / P_14_1
    expect(xml).toContain('<P_13_1>1000.00</P_13_1>')
    expect(xml).toContain('<P_14_1>230.00</P_14_1>')

    // 8% rate group: P_13_2 / P_14_2
    expect(xml).toContain('<P_13_2>2000.00</P_13_2>')
    expect(xml).toContain('<P_14_2>160.00</P_14_2>')

    // 5% rate group: P_13_3 / P_14_3
    expect(xml).toContain('<P_13_3>500.00</P_13_3>')
    expect(xml).toContain('<P_14_3>25.00</P_14_3>')

    // Gross total: 1230 + 2160 + 525 = 3915
    expect(xml).toContain('<P_15>3915.00</P_15>')

    // Each line has correct P_12 rate
    expect(xml).toContain('<P_12>23</P_12>')
    expect(xml).toContain('<P_12>8</P_12>')
    expect(xml).toContain('<P_12>5</P_12>')

    // All three line items present
    expect(xml).toContain('<NrWierszaFa>1</NrWierszaFa>')
    expect(xml).toContain('<NrWierszaFa>2</NrWierszaFa>')
    expect(xml).toContain('<NrWierszaFa>3</NrWierszaFa>')

    // Verify units
    expect(xml).toContain('<P_8A>szt.</P_8A>')
    expect(xml).toContain('<P_8A>kg</P_8A>')

    // No exemption
    expect(xml).toContain('<P_19N>1</P_19N>')
  })

  test('exempt invoice — zw rate', async ({ request }) => {
    const invoice = await createInvoice(request, {
      sellerName: 'Exempt Seller Sp. z o.o.',
      sellerTaxId: '7451834739',
      sellerAddress: 'ul. Zwolniona 5\n00-001 Warszawa',
      sellerCountryCode: 'PL',
      buyerName: 'Exempt Buyer',
      buyerTaxId: '5213842879',
      buyerCountryCode: 'PL',
      lineItems: [
        {
          lineNumber: 1,
          description: 'Usługa medyczna zwolniona z VAT',
          quantity: '1',
          unit: 'szt.',
          unitPriceNet: '500.00',
          netAmount: '500.00',
          vatRate: '0',
          vatRateCode: 'zw',
          vatAmount: '0.00',
          grossAmount: '500.00',
        },
      ],
    })

    const result = await generateXml(request, invoice.id)
    const xml = result.xml

    expect(result.lineItemCount).toBe(1)

    // Exempt net amount: P_13_8
    expect(xml).toContain('<P_13_8>500.00</P_13_8>')

    // Gross total
    expect(xml).toContain('<P_15>500.00</P_15>')

    // P_12 should be 'zw' for the line item
    expect(xml).toContain('<P_12>zw</P_12>')

    // Zwolnienie section should have P_19 = 1 and P_19A with legal basis
    expect(xml).toContain('<Zwolnienie>')
    expect(xml).toContain('<P_19>1</P_19>')
    expect(xml).toContain('<P_19A>')

    // Should NOT contain P_19N (that's for non-exempt invoices)
    expect(xml).not.toContain('<P_19N>')
  })

  test('EU buyer — KodUE + NrVatUE instead of NIP', async ({ request }) => {
    const invoice = await createInvoice(request, {
      sellerName: 'Polish Exporter Sp. z o.o.',
      sellerTaxId: '7451834739',
      sellerAddress: 'ul. Eksportowa 1\n00-001 Warszawa',
      sellerCountryCode: 'PL',
      buyerName: 'Deutsche GmbH',
      buyerTaxId: 'DE123456789',
      buyerAddress: 'Musterstraße 1\n10115 Berlin',
      buyerCountryCode: 'DE',
      lineItems: [
        {
          lineNumber: 1,
          description: 'Export service to EU',
          quantity: '1',
          unit: 'szt.',
          unitPriceNet: '5000.00',
          netAmount: '5000.00',
          vatRate: '23',
          vatRateCode: '23',
          vatAmount: '1150.00',
          grossAmount: '6150.00',
        },
      ],
    })

    const result = await generateXml(request, invoice.id)
    const xml = result.xml

    // Seller should use NIP (Polish company)
    expect(xml).toContain('<Podmiot1>')
    expect(xml).toContain('<NIP>7451834739</NIP>')

    // Buyer should use KodUE + NrVatUE (EU company, non-PL)
    expect(xml).toContain('<Podmiot2>')
    expect(xml).toContain('<KodUE>DE</KodUE>')
    expect(xml).toContain('<NrVatUE>DE123456789</NrVatUE>')

    // Buyer should NOT have <NIP> tag
    // Count NIP occurrences — only the seller's NIP should appear
    const nipMatches = xml.match(/<NIP>/g)
    expect(nipMatches).toHaveLength(1) // only seller NIP

    // Buyer address should use DE country code
    const podmiot2Section = xml.split('<Podmiot2>')[1]?.split('</Podmiot2>')[0] ?? ''
    expect(podmiot2Section).toContain('<KodKraju>DE</KodKraju>')
  })

  test('missing seller NIP → 400 error', async ({ request }) => {
    // Create invoice without sellerTaxId
    const createResponse = await apiRequest(request, 'POST', '/api/invoicing/invoices', {
      token,
      data: {
        invoiceNumber: `XML-NOSEL-${Date.now()}`,
        invoiceDate: new Date().toISOString().split('T')[0],
        direction: 'outgoing',
        sourceType: 'manual',
        currencyCode: 'PLN',
        sellerName: 'No NIP Seller',
        buyerName: 'Some Buyer',
        buyerTaxId: '5213842879',
        lineItems: [
          {
            lineNumber: 1,
            description: 'Some service',
            quantity: '1',
            unit: 'szt.',
            unitPriceNet: '100.00',
            netAmount: '100.00',
            vatRate: '23',
            vatRateCode: '23',
            vatAmount: '23.00',
            grossAmount: '123.00',
          },
        ],
      },
    })

    if (createResponse.ok()) {
      const invoice = await createResponse.json()
      createdInvoiceIds.push(invoice.id)

      const xmlResponse = await apiRequest(request, 'POST', `/api/invoicing/ksef/generate-xml/${invoice.id}`, {
        token,
      })
      expect(xmlResponse.status()).toBe(400)
      const body = await xmlResponse.json()
      expect(body.error).toContain('Seller tax ID')
    }
  })

  test('no line items → 400 error', async ({ request }) => {
    // Create invoice without line items
    const createResponse = await apiRequest(request, 'POST', '/api/invoicing/invoices', {
      token,
      data: {
        invoiceNumber: `XML-NOLINES-${Date.now()}`,
        invoiceDate: new Date().toISOString().split('T')[0],
        direction: 'outgoing',
        sourceType: 'manual',
        currencyCode: 'PLN',
        sellerName: 'Seller With NIP',
        sellerTaxId: '7451834739',
        buyerName: 'Some Buyer',
      },
    })

    if (createResponse.ok()) {
      const invoice = await createResponse.json()
      createdInvoiceIds.push(invoice.id)

      const xmlResponse = await apiRequest(request, 'POST', `/api/invoicing/ksef/generate-xml/${invoice.id}`, {
        token,
      })
      expect(xmlResponse.status()).toBe(400)
      const body = await xmlResponse.json()
      expect(body.error).toContain('line item')
    }
  })
})
