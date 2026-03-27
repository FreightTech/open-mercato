import {
  lineItemSchema,
  createInvoiceSchema,
  updateInvoiceSchema,
} from '../validators'

describe('lineItemSchema', () => {
  it('validates a complete line item', () => {
    const result = lineItemSchema.safeParse({
      lineNumber: 1,
      description: 'Test service',
      quantity: '2.5',
      unit: 'szt.',
      unitPriceNet: '100.00',
      vatRate: '23.00',
      vatRateCode: '23',
      netAmount: '250.00',
      vatAmount: '57.50',
      grossAmount: '307.50',
    })

    expect(result.success).toBe(true)
  })

  it('applies defaults for optional numeric fields', () => {
    const result = lineItemSchema.safeParse({
      lineNumber: 1,
      description: 'Test',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe('1')
      expect(result.data.unitPriceNet).toBe('0')
      expect(result.data.vatRate).toBe('0')
      expect(result.data.netAmount).toBe('0')
      expect(result.data.vatAmount).toBe('0')
      expect(result.data.grossAmount).toBe('0')
    }
  })

  it('rejects invalid quantity format', () => {
    const result = lineItemSchema.safeParse({
      lineNumber: 1,
      description: 'Test',
      quantity: 'abc',
    })

    expect(result.success).toBe(false)
  })

  it('rejects empty description', () => {
    const result = lineItemSchema.safeParse({
      lineNumber: 1,
      description: '',
    })

    expect(result.success).toBe(false)
  })

  it('validates all VAT rate codes', () => {
    const codes = ['23', '8', '5', '0', 'zw', 'oo', 'np']
    for (const code of codes) {
      const result = lineItemSchema.safeParse({
        lineNumber: 1,
        description: 'Test',
        vatRateCode: code,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid VAT rate code', () => {
    const result = lineItemSchema.safeParse({
      lineNumber: 1,
      description: 'Test',
      vatRateCode: 'invalid',
    })

    expect(result.success).toBe(false)
  })
})

describe('createInvoiceSchema', () => {
  it('validates a minimal invoice', () => {
    const result = createInvoiceSchema.safeParse({
      organizationId: 'a0000000-0000-4000-8000-000000000001',
      tenantId: 'b0000000-0000-4000-8000-000000000002',
      invoiceNumber: 'FV/2026/03/001',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('draft')
      expect(result.data.direction).toBe('outgoing')
      expect(result.data.sourceType).toBe('manual')
      expect(result.data.currencyCode).toBe('PLN')
      expect(result.data.netAmount).toBe('0')
    }
  })

  it('accepts invoice with line items', () => {
    const result = createInvoiceSchema.safeParse({
      organizationId: 'a0000000-0000-4000-8000-000000000001',
      tenantId: 'b0000000-0000-4000-8000-000000000002',
      invoiceNumber: 'FV/001',
      lineItems: [
        { lineNumber: 1, description: 'Service', quantity: '1', unitPriceNet: '100.00', vatRate: '23', netAmount: '100.00', vatAmount: '23.00', grossAmount: '123.00' },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lineItems).toHaveLength(1)
    }
  })

  it('rejects missing required fields', () => {
    const result = createInvoiceSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('validates currency code format', () => {
    const valid = createInvoiceSchema.safeParse({
      organizationId: 'a0000000-0000-4000-8000-000000000001',
      tenantId: 'b0000000-0000-4000-8000-000000000002',
      invoiceNumber: 'X',
      currencyCode: 'EUR',
    })
    expect(valid.success).toBe(true)

    const invalid = createInvoiceSchema.safeParse({
      organizationId: 'a0000000-0000-4000-8000-000000000001',
      tenantId: 'b0000000-0000-4000-8000-000000000002',
      invoiceNumber: 'X',
      currencyCode: 'xx',
    })
    expect(invalid.success).toBe(false)
  })
})

describe('updateInvoiceSchema', () => {
  it('accepts partial updates', () => {
    const result = updateInvoiceSchema.safeParse({
      invoiceNumber: 'FV/2026/03/002',
      status: 'approved',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.invoiceNumber).toBe('FV/2026/03/002')
      expect(result.data.status).toBe('approved')
      expect(result.data.sellerName).toBeUndefined()
    }
  })

  it('accepts update with line items', () => {
    const result = updateInvoiceSchema.safeParse({
      lineItems: [
        { lineNumber: 1, description: 'Updated item', quantity: '3', unitPriceNet: '50.00', vatRate: '23', netAmount: '150.00', vatAmount: '34.50', grossAmount: '184.50' },
        { lineNumber: 2, description: 'New item', quantity: '1', unitPriceNet: '75.00', vatRate: '8', netAmount: '75.00', vatAmount: '6.00', grossAmount: '81.00' },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lineItems).toHaveLength(2)
    }
  })

  it('accepts empty object (no changes)', () => {
    const result = updateInvoiceSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects invalid status value', () => {
    const result = updateInvoiceSchema.safeParse({
      status: 'invalid_status',
    })

    expect(result.success).toBe(false)
  })

  it('accepts nullable fields', () => {
    const result = updateInvoiceSchema.safeParse({
      sellerName: null,
      buyerName: null,
      notes: null,
      paymentMethod: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sellerName).toBeNull()
      expect(result.data.buyerName).toBeNull()
    }
  })
})
