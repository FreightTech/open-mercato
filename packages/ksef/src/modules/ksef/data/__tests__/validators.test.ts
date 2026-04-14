/** @jest-environment node */
import {
  ksefInvoiceCreateSchema,
  ksefInvoiceUpdateSchema,
  ksefInvoiceOrderLineSchema,
  ksefInvoiceAdvanceRefSchema,
  UPR_MAX_GROSS_PLN,
  type KsefInvoiceType,
} from '../validators'

function baseLineItem(overrides: Record<string, unknown> = {}) {
  return {
    lineNumber: 1,
    description: 'Transport',
    quantity: '1',
    unit: 'szt.',
    unitPriceNet: '1000.00',
    netAmount: '1000.00',
    vatAmount: '230.00',
    vatRate: '23',
    ...overrides,
  }
}

function baseOrderLine(overrides: Record<string, unknown> = {}) {
  return {
    lineNumber: 1,
    description: 'Order item',
    unit: 'szt.',
    quantity: '1',
    netAmount: '1000.00',
    vatAmount: '230.00',
    vatRate: '23',
    ...overrides,
  }
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: 'FV/2026/04/001',
    invoiceDate: '2026-04-10',
    serviceDate: '2026-04-10',
    sellerName: 'Test Sp. z o.o.',
    sellerTaxId: '7980332920',
    sellerAddress: 'ul. Testowa 1\n00-001 Warszawa',
    sellerCountryCode: 'PL',
    buyerName: 'Kupiec S.A.',
    buyerTaxId: '5261040828',
    buyerAddress: 'ul. Handlowa 5\n31-001 Kraków',
    buyerCountryCode: 'PL',
    netAmount: '1000.00',
    vatAmount: '230.00',
    grossAmount: '1230.00',
    currencyCode: 'PLN',
    paymentMethod: '1',
    invoiceType: 'VAT' as KsefInvoiceType,
    direction: 'outgoing' as const,
    lineItems: [baseLineItem()],
    ...overrides,
  }
}

function pathsFromIssues(error: { issues: Array<{ path: (string | number)[] }> }): string[] {
  return error.issues.map((i) => i.path.join('.'))
}

describe('ksefInvoiceCreateSchema — VAT (baseline)', () => {
  it('accepts a well-formed VAT invoice', () => {
    const result = ksefInvoiceCreateSchema.safeParse(basePayload())
    expect(result.success).toBe(true)
  })

  it('rejects missing invoice number', () => {
    const result = ksefInvoiceCreateSchema.safeParse(basePayload({ invoiceNumber: '' }))
    expect(result.success).toBe(false)
  })

  it('rejects VAT invoice without line items', () => {
    const result = ksefInvoiceCreateSchema.safeParse(basePayload({ lineItems: [] }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('lineItems')
    }
  })
})

describe('ksefInvoiceCreateSchema — KOR', () => {
  const korBase = () =>
    basePayload({
      invoiceType: 'KOR',
      correctionReason: 'Quantity mistake',
      correctedKsefNumber: '1234567890-20260301-ABCDEF-01',
      correctionEffectType: 1,
    })

  it('accepts KOR with KSeF number reference', () => {
    const result = ksefInvoiceCreateSchema.safeParse(korBase())
    expect(result.success).toBe(true)
  })

  it('accepts KOR with invoice-number reference (pre-KSeF original)', () => {
    const payload = korBase()
    delete (payload as Record<string, unknown>).correctedKsefNumber
    ;(payload as Record<string, unknown>).correctedInvoiceNumber = 'FV/2025/12/042'
    const result = ksefInvoiceCreateSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('rejects KOR without any reference to the original', () => {
    const payload = korBase()
    delete (payload as Record<string, unknown>).correctedKsefNumber
    const result = ksefInvoiceCreateSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('correctedKsefNumber')
    }
  })

  it('rejects KOR without correctionReason', () => {
    const payload = korBase()
    delete (payload as Record<string, unknown>).correctionReason
    const result = ksefInvoiceCreateSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('correctionReason')
    }
  })

  it('rejects KOR with blank correctionReason', () => {
    const result = ksefInvoiceCreateSchema.safeParse(korBase().constructor === Object
      ? { ...korBase(), correctionReason: '   ' }
      : korBase())
    expect(result.success).toBe(false)
  })

  it('accepts KOR_ZAL when it also satisfies ZAL rules', () => {
    const result = ksefInvoiceCreateSchema.safeParse({
      ...korBase(),
      invoiceType: 'KOR_ZAL',
      advanceAmount: '500.00',
      orderTotalGross: '1230.00',
      orderLines: [baseOrderLine()],
      lineItems: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects KOR_ROZ when advance refs are missing', () => {
    const result = ksefInvoiceCreateSchema.safeParse({
      ...korBase(),
      invoiceType: 'KOR_ROZ',
      advanceRefs: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('advanceRefs')
    }
  })
})

describe('ksefInvoiceCreateSchema — ZAL', () => {
  const zalBase = () =>
    basePayload({
      invoiceType: 'ZAL',
      advanceAmount: '500.00',
      orderTotalGross: '1230.00',
      orderLines: [baseOrderLine()],
      lineItems: [],
    })

  it('accepts ZAL with Zamowienie block', () => {
    const result = ksefInvoiceCreateSchema.safeParse(zalBase())
    expect(result.success).toBe(true)
  })

  it('rejects ZAL without order lines', () => {
    const result = ksefInvoiceCreateSchema.safeParse({ ...zalBase(), orderLines: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('orderLines')
    }
  })

  it('rejects ZAL without orderTotalGross', () => {
    const payload = zalBase()
    delete (payload as Record<string, unknown>).orderTotalGross
    const result = ksefInvoiceCreateSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('orderTotalGross')
    }
  })

  it('rejects ZAL with advance > orderTotalGross', () => {
    const result = ksefInvoiceCreateSchema.safeParse({
      ...zalBase(),
      advanceAmount: '2000.00',
      orderTotalGross: '1230.00',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('advanceAmount')
    }
  })

  it('rejects ZAL with zero advance', () => {
    const result = ksefInvoiceCreateSchema.safeParse({ ...zalBase(), advanceAmount: '0' })
    expect(result.success).toBe(false)
  })

  it('accepts final ZAL with advance refs', () => {
    const result = ksefInvoiceCreateSchema.safeParse({
      ...zalBase(),
      isFinalAdvance: true,
      advanceRefs: [
        { ksefNumber: '1111-20260201-AAA-01', advanceAmount: '600.00' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects final ZAL without advance refs', () => {
    const result = ksefInvoiceCreateSchema.safeParse({
      ...zalBase(),
      isFinalAdvance: true,
      advanceRefs: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('advanceRefs')
    }
  })
})

describe('ksefInvoiceCreateSchema — ROZ', () => {
  const rozBase = () =>
    basePayload({
      invoiceType: 'ROZ',
      advanceRefs: [
        { ksefNumber: '2222-20260301-BBB-02', advanceAmount: '615.00' },
      ],
    })

  it('accepts ROZ with ≥1 advance reference', () => {
    const result = ksefInvoiceCreateSchema.safeParse(rozBase())
    expect(result.success).toBe(true)
  })

  it('rejects ROZ without advance refs', () => {
    const result = ksefInvoiceCreateSchema.safeParse({ ...rozBase(), advanceRefs: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('advanceRefs')
    }
  })
})

describe('ksefInvoiceCreateSchema — UPR', () => {
  const uprBase = () =>
    basePayload({
      invoiceType: 'UPR',
      netAmount: '365.85',
      vatAmount: '84.15',
      grossAmount: '450.00',
    })

  it('accepts UPR at the 450 PLN cap', () => {
    const result = ksefInvoiceCreateSchema.safeParse(uprBase())
    expect(result.success).toBe(true)
  })

  it(`rejects UPR with gross > ${UPR_MAX_GROSS_PLN} PLN`, () => {
    const result = ksefInvoiceCreateSchema.safeParse({ ...uprBase(), grossAmount: '451.00' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('grossAmount')
    }
  })

  it('rejects UPR in foreign currency', () => {
    const result = ksefInvoiceCreateSchema.safeParse({ ...uprBase(), currencyCode: 'EUR' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('currencyCode')
    }
  })

  it('rejects UPR without buyer NIP', () => {
    const result = ksefInvoiceCreateSchema.safeParse({ ...uprBase(), buyerTaxId: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('buyerTaxId')
    }
  })
})

describe('ksefInvoiceOrderLineSchema', () => {
  it('accepts a valid order line', () => {
    const result = ksefInvoiceOrderLineSchema.safeParse(baseOrderLine())
    expect(result.success).toBe(true)
  })

  it('rejects an empty description', () => {
    const result = ksefInvoiceOrderLineSchema.safeParse(baseOrderLine({ description: '' }))
    expect(result.success).toBe(false)
  })
})

describe('ksefInvoiceAdvanceRefSchema', () => {
  it('accepts KSeF-number-only reference', () => {
    const result = ksefInvoiceAdvanceRefSchema.safeParse({
      ksefNumber: '1111-20260201-AAA-01',
      advanceAmount: '600.00',
    })
    expect(result.success).toBe(true)
  })

  it('accepts invoice-number-only reference', () => {
    const result = ksefInvoiceAdvanceRefSchema.safeParse({
      invoiceNumber: 'FV/2026/02/010',
      advanceAmount: '600.00',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty reference', () => {
    const result = ksefInvoiceAdvanceRefSchema.safeParse({ advanceAmount: '600.00' })
    expect(result.success).toBe(false)
  })
})

describe('ksefInvoiceUpdateSchema', () => {
  it('accepts partial updates without invoiceType', () => {
    const result = ksefInvoiceUpdateSchema.safeParse({ invoiceNumber: 'FV/2026/04/002' })
    expect(result.success).toBe(true)
  })

  it('skips checks on fields the caller did not send', () => {
    // Partial PATCH that only flips the type — fields the server already
    // has on disk are not re-validated. This is intentional: the rule
    // function runs in 'update' mode and only checks fields that are
    // present in the payload.
    const result = ksefInvoiceUpdateSchema.safeParse({ invoiceType: 'KOR' })
    expect(result.success).toBe(true)
  })

  it('re-applies per-type rules on the fields actually provided', () => {
    // Here the caller explicitly touched correctionReason (with a blank
    // value) and declared KOR — the validator should reject.
    const result = ksefInvoiceUpdateSchema.safeParse({
      invoiceType: 'KOR',
      correctionReason: '   ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('correctionReason')
    }
  })

  it('rejects UPR update when gross exceeds the cap', () => {
    const result = ksefInvoiceUpdateSchema.safeParse({
      invoiceType: 'UPR',
      grossAmount: '500.00',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(pathsFromIssues(result.error)).toContain('grossAmount')
    }
  })

  it('accepts UPR update when gross is within the cap', () => {
    const result = ksefInvoiceUpdateSchema.safeParse({
      invoiceType: 'UPR',
      grossAmount: '399.00',
      currencyCode: 'PLN',
      buyerTaxId: '5261040828',
    })
    expect(result.success).toBe(true)
  })
})
