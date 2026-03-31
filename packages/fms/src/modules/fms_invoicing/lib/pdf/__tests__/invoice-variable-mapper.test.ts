import {
  mapInvoiceToInputs,
  formatLineItemsTableData,
  formatVatSummaryTableData,
} from '../invoice-variable-mapper'

describe('mapInvoiceToInputs', () => {
  it('maps a full invoice to template variables', () => {
    const invoice = {
      invoiceNumber: 'FV/2026/03/001',
      invoiceDate: new Date('2026-03-22'),
      dueDate: new Date('2026-04-22'),
      serviceDate: new Date('2026-03-20'),
      sellerName: 'Test Seller Sp. z o.o.',
      sellerTaxId: '1234567890',
      sellerAddress: 'ul. Testowa 1, 00-001 Warszawa',
      sellerCountryCode: 'PL',
      sellerBankAccount: 'PL12 3456 7890 1234 5678',
      buyerName: 'Buyer Company',
      buyerTaxId: '9876543210',
      buyerAddress: 'ul. Kupna 5, 00-002 Kraków',
      buyerCountryCode: 'PL',
      netAmount: '1000.00',
      vatAmount: '230.00',
      grossAmount: '1230.00',
      currencyCode: 'PLN',
      paymentMethod: 'przelew',
      paymentTerms: '14 days',
      notes: 'Test note',
    }

    const result = mapInvoiceToInputs(invoice)

    expect(result.invoiceTitle).toBe('FAKTURA VAT')
    expect(result.invoiceNumber).toBe('FV/2026/03/001')
    expect(result.invoiceDate).toBe('22.03.2026')
    expect(result.dueDate).toBe('22.04.2026')
    expect(result.serviceDate).toBe('20.03.2026')
    expect(result.sellerName).toBe('Test Seller Sp. z o.o.')
    expect(result.sellerNip).toBe('1234567890')
    expect(result.sellerAddress).toBe('ul. Testowa 1, 00-001 Warszawa')
    expect(result.sellerBankAccount).toBe('PL12 3456 7890 1234 5678')
    expect(result.buyerName).toBe('Buyer Company')
    expect(result.buyerNip).toBe('9876543210')
    expect(result.buyerAddress).toBe('ul. Kupna 5, 00-002 Kraków')
    expect(result.netTotal).toBe('1 000,00 PLN')
    expect(result.vatTotal).toBe('230,00 PLN')
    expect(result.grossTotal).toBe('1 230,00 PLN')
    expect(result.paymentMethod).toBe('przelew')
    expect(result.notes).toBe('Test note')
  })

  it('handles null/empty fields gracefully', () => {
    const invoice = {
      invoiceNumber: 'DRAFT',
      invoiceDate: null,
      dueDate: null,
      serviceDate: null,
      sellerName: null,
      sellerTaxId: null,
      sellerAddress: null,
      sellerCountryCode: null,
      sellerBankAccount: null,
      buyerName: null,
      buyerTaxId: null,
      buyerAddress: null,
      buyerCountryCode: null,
      netAmount: null,
      vatAmount: null,
      grossAmount: null,
      currencyCode: null,
      paymentMethod: null,
      paymentTerms: null,
      notes: null,
    }

    const result = mapInvoiceToInputs(invoice)

    expect(result.invoiceNumber).toBe('DRAFT')
    expect(result.invoiceDate).toBe('')
    expect(result.sellerName).toBe('')
    expect(result.sellerNip).toBe('')
    expect(result.buyerName).toBe('')
    expect(result.netTotal).toBe('0,00 PLN')
    expect(result.vatTotal).toBe('0,00 PLN')
    expect(result.grossTotal).toBe('0,00 PLN')
    expect(result.paymentMethod).toBe('przelew')
    expect(result.sellerCountry).toBe('PL')
  })

  it('formats date strings correctly', () => {
    const invoice = {
      invoiceNumber: 'X',
      invoiceDate: '2026-01-15',
      dueDate: '2026-02-15',
      serviceDate: '2026-01-10',
    }

    const result = mapInvoiceToInputs(invoice)

    expect(result.invoiceDate).toBe('15.01.2026')
    expect(result.dueDate).toBe('15.02.2026')
    expect(result.serviceDate).toBe('10.01.2026')
  })

  it('formats large amounts with space thousands separator', () => {
    const invoice = {
      invoiceNumber: 'X',
      netAmount: '1234567.89',
      vatAmount: '283950.61',
      grossAmount: '1518518.50',
      currencyCode: 'EUR',
    }

    const result = mapInvoiceToInputs(invoice)

    expect(result.netTotal).toBe('1 234 567,89 EUR')
    expect(result.vatTotal).toBe('283 950,61 EUR')
    expect(result.grossTotal).toBe('1 518 518,50 EUR')
  })
})

describe('formatLineItemsTableData', () => {
  it('formats line items as a JSON table array with header', () => {
    const items = [
      {
        lineNumber: 1,
        description: 'Service A',
        quantity: '2',
        unit: 'szt.',
        unitPriceNet: '500.00',
        vatRate: '23',
        vatRateCode: '23',
        netAmount: '1000.00',
        vatAmount: '230.00',
        grossAmount: '1230.00',
      },
      {
        lineNumber: 2,
        description: 'Service B',
        quantity: '1',
        unit: 'godz.',
        unitPriceNet: '200.00',
        vatRate: '8',
        vatRateCode: '8',
        netAmount: '200.00',
        vatAmount: '16.00',
        grossAmount: '216.00',
      },
    ]

    const result = formatLineItemsTableData(items)
    const parsed = JSON.parse(result)

    expect(parsed).toHaveLength(2)
    expect(parsed[0][0]).toBe('1')
    expect(parsed[0][1]).toBe('Service A')
    expect(parsed[0][2]).toBe('szt.')
    expect(parsed[0][3]).toBe('2')  // quantity formatted
    expect(parsed[0][4]).toBe('500,00')
    expect(parsed[0][5]).toBe('23%')  // rate cleaned: "23" → "23%"
    expect(parsed[0][6]).toBe('1 000,00')
    expect(parsed[1][0]).toBe('2')
    expect(parsed[1][1]).toBe('Service B')
    expect(parsed[1][5]).toBe('8%')  // rate cleaned: "8" → "8%"
  })

  it('handles special VAT rate codes', () => {
    const items = [
      {
        lineNumber: 1,
        description: 'Exempt service',
        quantity: '1',
        unit: null,
        unitPriceNet: '100.00',
        vatRate: '0',
        vatRateCode: 'zw',
        netAmount: '100.00',
        vatAmount: '0.00',
        grossAmount: '100.00',
      },
      {
        lineNumber: 2,
        description: 'Not applicable',
        quantity: '1',
        unit: null,
        unitPriceNet: '50.00',
        vatRate: '0',
        vatRateCode: 'np',
        netAmount: '50.00',
        vatAmount: '0.00',
        grossAmount: '50.00',
      },
    ]

    const result = formatLineItemsTableData(items)
    const parsed = JSON.parse(result)

    expect(parsed[0][5]).toBe('zw.')
    expect(parsed[1][5]).toBe('n.p.')
  })

  it('formats quantity by trimming trailing zeros', () => {
    const items = [
      { lineNumber: 1, description: 'A', quantity: '1.0000', unit: 'szt.', unitPriceNet: '10.00', vatRate: '23.00', vatRateCode: '23', netAmount: '10.00', vatAmount: '2.30', grossAmount: '12.30' },
      { lineNumber: 2, description: 'B', quantity: '2.5000', unit: 'szt.', unitPriceNet: '10.00', vatRate: '23.00', vatRateCode: '23', netAmount: '25.00', vatAmount: '5.75', grossAmount: '30.75' },
      { lineNumber: 3, description: 'C', quantity: '0.2500', unit: 'kg', unitPriceNet: '10.00', vatRate: '23.00', vatRateCode: '23', netAmount: '2.50', vatAmount: '0.58', grossAmount: '3.08' },
    ]

    const result = formatLineItemsTableData(items)
    const parsed = JSON.parse(result)

    expect(parsed[0][3]).toBe('1')      // 1.0000 → 1
    expect(parsed[1][3]).toBe('2,5')    // 2.5000 → 2,5
    expect(parsed[2][3]).toBe('0,25')   // 0.2500 → 0,25
  })

  it('formats VAT rate by cleaning decimal zeros', () => {
    const items = [
      { lineNumber: 1, description: 'A', quantity: '1', unit: null, unitPriceNet: '10.00', vatRate: '23.00', vatRateCode: '23', netAmount: '10.00', vatAmount: '2.30', grossAmount: '12.30' },
      { lineNumber: 2, description: 'B', quantity: '1', unit: null, unitPriceNet: '10.00', vatRate: '0.00', vatRateCode: '0', netAmount: '10.00', vatAmount: '0.00', grossAmount: '10.00' },
      { lineNumber: 3, description: 'C', quantity: '1', unit: null, unitPriceNet: '10.00', vatRate: '5.50', vatRateCode: null, netAmount: '10.00', vatAmount: '0.55', grossAmount: '10.55' },
    ]

    const result = formatLineItemsTableData(items)
    const parsed = JSON.parse(result)

    expect(parsed[0][5]).toBe('23%')    // 23.00 → 23%
    expect(parsed[1][5]).toBe('0%')     // 0.00 → 0%
    expect(parsed[2][5]).toBe('5,5%')   // 5.50 → 5,5%
  })

  it('uses szt. as default unit when null', () => {
    const items = [
      {
        lineNumber: 1,
        description: 'Item',
        quantity: '1',
        unit: null,
        unitPriceNet: '10.00',
        vatRate: '23',
        vatRateCode: null,
        netAmount: '10.00',
        vatAmount: '2.30',
        grossAmount: '12.30',
      },
    ]

    const result = formatLineItemsTableData(items)
    const parsed = JSON.parse(result)

    expect(parsed[0][2]).toBe('szt.')
  })
})

describe('formatVatSummaryTableData', () => {
  it('groups amounts by VAT rate', () => {
    const items = [
      {
        lineNumber: 1,
        description: 'A',
        quantity: '1',
        unit: null,
        unitPriceNet: '100.00',
        vatRate: '23',
        vatRateCode: '23',
        netAmount: '100.00',
        vatAmount: '23.00',
        grossAmount: '123.00',
      },
      {
        lineNumber: 2,
        description: 'B',
        quantity: '1',
        unit: null,
        unitPriceNet: '200.00',
        vatRate: '23',
        vatRateCode: '23',
        netAmount: '200.00',
        vatAmount: '46.00',
        grossAmount: '246.00',
      },
      {
        lineNumber: 3,
        description: 'C',
        quantity: '1',
        unit: null,
        unitPriceNet: '50.00',
        vatRate: '8',
        vatRateCode: '8',
        netAmount: '50.00',
        vatAmount: '4.00',
        grossAmount: '54.00',
      },
    ]

    const result = formatVatSummaryTableData(items)
    const parsed = JSON.parse(result)

    expect(parsed).toHaveLength(2)

    const rate23Row = parsed.find((r: string[]) => r[0] === '23%')
    expect(rate23Row).toBeTruthy()
    expect(rate23Row[1]).toBe('300,00')
    expect(rate23Row[2]).toBe('69,00')
    expect(rate23Row[3]).toBe('369,00')

    const rate8Row = parsed.find((r: string[]) => r[0] === '8%')
    expect(rate8Row).toBeTruthy()
    expect(rate8Row[1]).toBe('50,00')
  })
})
