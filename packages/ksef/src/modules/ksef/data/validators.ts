import { z } from 'zod'

export const ksefSubmissionStatusSchema = z.enum([
  'none', 'queued', 'submitted', 'processing', 'accepted',
  'upo_downloaded', 'rejected', 'error', 'cancelled',
])

export const ksefEnvironmentSchema = z.enum(['test', 'demo', 'production'])

export const ksefAuthTypeSchema = z.enum(['token', 'certificate'])

export const ksefSessionModeSchema = z.enum(['interactive', 'batch'])

export const offlineModeSchema = z.enum(['online', 'offline24', 'unavailability', 'emergency'])

export const submitBatchSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(500),
})

export const syncReceivedSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  subjectType: z.enum(['subject1', 'subject2', 'subject3']).default('subject2'),
})

export type SubmitBatchDto = z.infer<typeof submitBatchSchema>
export type SyncReceivedDto = z.infer<typeof syncReceivedSchema>

// ========================================
// KSeF Invoice schemas
// ========================================

export const ksefInvoiceDirectionSchema = z.enum(['outgoing', 'incoming'])

export const ksefInvoiceTypeSchema = z.enum([
  'VAT',
  'KOR',
  'ZAL',
  'ROZ',
  'UPR',
  'KOR_ZAL',
  'KOR_ROZ',
])

export type KsefInvoiceType = z.infer<typeof ksefInvoiceTypeSchema>

/** Upper bound of `P_15` for UPR (simplified) invoices, per Art. 106e(5)(3). */
export const UPR_MAX_GROSS_PLN = 450

/** Types that extend the KOR family and reuse its rules. */
export const CORRECTION_INVOICE_TYPES = new Set<KsefInvoiceType>(['KOR', 'KOR_ZAL', 'KOR_ROZ'])

/** Types that require a Zamowienie block (order lines + order total). */
export const ORDER_SECTION_INVOICE_TYPES = new Set<KsefInvoiceType>(['ZAL', 'KOR_ZAL'])

/** Types that require or allow references to prior advance invoices. */
export const ADVANCE_REF_INVOICE_TYPES = new Set<KsefInvoiceType>(['ROZ', 'KOR_ROZ'])

const numericString = z.union([z.string(), z.number()]).transform((v) => String(v))

export const ksefInvoiceLineItemSchema = z.object({
  lineNumber: z.number().int().min(1),
  description: z.string().min(1),
  quantity: numericString,
  unit: z.string().nullable().optional(),
  unitPriceNet: numericString,
  netAmount: numericString,
  vatAmount: numericString,
  vatRate: z.string(),
  vatRateCode: z.string().nullable().optional(),
  gtuCode: z.string().nullable().optional(),
  isPreState: z.boolean().optional(),
})

export const ksefInvoiceOrderLineSchema = z.object({
  lineNumber: z.number().int().min(1),
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  quantity: numericString,
  netAmount: numericString,
  vatAmount: numericString,
  vatRate: z.string(),
})

export const ksefInvoiceAdvanceRefSchema = z
  .object({
    ksefNumber: z.string().trim().min(1).nullable().optional(),
    invoiceNumber: z.string().trim().min(1).nullable().optional(),
    issueDate: z.string().nullable().optional(),
    advanceAmount: numericString.nullable().optional(),
  })
  .refine(
    (v) => Boolean(v.ksefNumber) || Boolean(v.invoiceNumber),
    { message: 'Each advance reference needs either a KSeF number or an invoice number.' },
  )

const baseInvoiceShape = {
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  serviceDate: z.string().nullable().optional(),

  sellerName: z.string().nullable().optional(),
  sellerTaxId: z.string().nullable().optional(),
  sellerAddress: z.string().nullable().optional(),
  sellerCountryCode: z.string().nullable().optional(),
  sellerBankAccount: z.string().nullable().optional(),

  buyerName: z.string().nullable().optional(),
  buyerTaxId: z.string().nullable().optional(),
  buyerAddress: z.string().nullable().optional(),
  buyerCountryCode: z.string().nullable().optional(),

  netAmount: numericString.optional(),
  vatAmount: numericString.optional(),
  grossAmount: numericString,
  currencyCode: z.string().default('PLN'),
  paymentMethod: z.string().nullable().optional(),

  invoiceType: ksefInvoiceTypeSchema.default('VAT'),

  // Correction (KOR family)
  correctedInvoiceId: z.string().uuid().nullable().optional(),
  correctedKsefNumber: z.string().nullable().optional(),
  correctedInvoiceNumber: z.string().nullable().optional(),
  correctedInvoiceIssueDate: z.string().nullable().optional(),
  correctionReason: z.string().nullable().optional(),
  correctionEffectType: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
  correctionPeriod: z.string().nullable().optional(),

  // Advance / Zamowienie (ZAL, KOR_ZAL)
  advanceAmount: numericString.nullable().optional(),
  orderTotalGross: numericString.nullable().optional(),
  isFinalAdvance: z.boolean().optional(),
  orderLines: z.array(ksefInvoiceOrderLineSchema).optional(),

  // FakturaZaliczkowa references (ROZ, KOR_ROZ, last ZAL)
  advanceRefs: z.array(ksefInvoiceAdvanceRefSchema).optional(),

  // Foreign-currency → PLN conversion (P_14_xW)
  exchangeRate: numericString.nullable().optional(),
  exchangeRateDate: z.string().nullable().optional(),

  // Adnotacje — boolean flags persisted as columns
  annotCashAccounting: z.boolean().optional(),
  annotSelfBilling: z.boolean().optional(),
  annotReverseCharge: z.boolean().optional(),
  annotSplitPayment: z.boolean().optional(),
  annotIntraCommunitySupply: z.boolean().optional(),
  annotExportOfServices: z.boolean().optional(),
  annotNewTransportMeans: z.boolean().optional(),

  direction: ksefInvoiceDirectionSchema.default('outgoing'),
  externalInvoiceId: z.string().uuid().nullable().optional(),
  lineItems: z.array(ksefInvoiceLineItemSchema).min(0),
}

const toNumberOr = (v: string | number | null | undefined, fallback: number): number => {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

type InvoiceRuleValue = {
  invoiceType?: KsefInvoiceType
  lineItems?: Array<{ lineNumber: number }>
  orderLines?: Array<{ lineNumber: number }>
  advanceRefs?: Array<unknown>
  correctionReason?: string | null
  correctedKsefNumber?: string | null
  correctedInvoiceNumber?: string | null
  correctionEffectType?: 1 | 2 | null
  advanceAmount?: string | number | null
  orderTotalGross?: string | number | null
  isFinalAdvance?: boolean
  grossAmount?: string | number
  currencyCode?: string
  buyerTaxId?: string | null
}

/**
 * Applies FA(3) RodzajFaktury-specific invariants on top of the flat shape.
 *
 * On `create`, every type-specific required field must be present. On
 * `update`, a check only fires when the fields it touches are actually in
 * the payload — this keeps partial PATCHes that don't re-send
 * `lineItems`/`orderLines`/`advanceRefs`/etc. from re-validating invariants
 * that are out of scope for the update.
 */
function applyInvoiceTypeRules(
  value: InvoiceRuleValue,
  ctx: z.RefinementCtx,
  mode: 'create' | 'update',
) {
  const type = (value.invoiceType ?? 'VAT') as KsefInvoiceType
  const isCorrection = CORRECTION_INVOICE_TYPES.has(type)
  const needsOrderSection = ORDER_SECTION_INVOICE_TYPES.has(type)
  const needsAdvanceRefs = ADVANCE_REF_INVOICE_TYPES.has(type)

  const has = <K extends keyof InvoiceRuleValue>(key: K): boolean => value[key] !== undefined
  // On create, every field is in scope — checks always fire. On update,
  // only validate what the caller sent.
  const shouldCheck = (key: keyof InvoiceRuleValue): boolean => mode === 'create' || has(key)

  // Line items — required unless the type is advance-only (ZAL or KOR_ZAL),
  // where `Zamowienie` carries item detail instead.
  if (!needsOrderSection && shouldCheck('lineItems')) {
    const lineItems = value.lineItems ?? []
    if (lineItems.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineItems'],
        message: `Invoice type ${type} requires at least one line item.`,
      })
    }
  }

  if (isCorrection) {
    if (shouldCheck('correctionReason')) {
      if (!value.correctionReason || !value.correctionReason.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctionReason'],
          message: 'Correction reason (PrzyczynaKorekty) is required for KOR invoices.',
        })
      }
    }
    if (mode === 'create' || has('correctedKsefNumber') || has('correctedInvoiceNumber')) {
      const hasKsefRef = Boolean(value.correctedKsefNumber && value.correctedKsefNumber.trim())
      const hasNumberRef = Boolean(value.correctedInvoiceNumber && value.correctedInvoiceNumber.trim())
      if (!hasKsefRef && !hasNumberRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctedKsefNumber'],
          message:
            'Corrective invoices must reference the original — provide the original KSeF number or, for pre-KSeF originals, the invoice number.',
        })
      }
    }
    if (value.correctionEffectType != null && value.correctionEffectType !== 1 && value.correctionEffectType !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctionEffectType'],
        message: 'correctionEffectType must be 1 (original period) or 2 (current period).',
      })
    }
  }

  if (needsOrderSection) {
    if (shouldCheck('orderLines')) {
      const orderLines = value.orderLines ?? []
      if (orderLines.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['orderLines'],
          message: 'ZAL invoices require at least one Zamowienie (order) line.',
        })
      }
    }
    if (shouldCheck('orderTotalGross')) {
      const orderTotal = toNumberOr(value.orderTotalGross, 0)
      if (orderTotal <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['orderTotalGross'],
          message: 'WartoscZamowienia (order total gross) must be greater than 0 for ZAL invoices.',
        })
      }
    }
    if (shouldCheck('advanceAmount')) {
      const advance = toNumberOr(value.advanceAmount, 0)
      if (advance <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['advanceAmount'],
          message: 'Advance amount (P_15 for ZAL) must be greater than 0.',
        })
      }
      const orderTotal = toNumberOr(value.orderTotalGross, 0)
      if (orderTotal > 0 && advance > orderTotal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['advanceAmount'],
          message: 'Advance amount cannot exceed the total order value.',
        })
      }
    }
    if (value.isFinalAdvance) {
      if (mode === 'create' || has('advanceRefs')) {
        const advanceRefs = value.advanceRefs ?? []
        if (advanceRefs.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['advanceRefs'],
            message:
              'Final ZAL (covering 100% of the order) must reference every previous advance invoice via advanceRefs.',
          })
        }
      }
    }
  }

  if (needsAdvanceRefs && (mode === 'create' || has('advanceRefs'))) {
    const advanceRefs = value.advanceRefs ?? []
    if (advanceRefs.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['advanceRefs'],
        message: 'ROZ invoices must reference at least one prior advance (FakturaZaliczkowa).',
      })
    }
  }

  if (type === 'UPR') {
    if (shouldCheck('currencyCode')) {
      const currency = value.currencyCode ?? 'PLN'
      if (currency !== 'PLN') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['currencyCode'],
          message: 'UPR (simplified) invoices must be issued in PLN.',
        })
      }
    }
    if (shouldCheck('grossAmount')) {
      const gross = toNumberOr(value.grossAmount, 0)
      if (gross > UPR_MAX_GROSS_PLN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['grossAmount'],
          message: `UPR gross total cannot exceed ${UPR_MAX_GROSS_PLN} PLN.`,
        })
      }
    }
    if (shouldCheck('buyerTaxId')) {
      if (!value.buyerTaxId || !value.buyerTaxId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['buyerTaxId'],
          message: 'UPR invoices still require a buyer NIP.',
        })
      }
    }
  }
}

export const ksefInvoiceCreateSchema = z
  .object(baseInvoiceShape)
  .superRefine((value, ctx) => applyInvoiceTypeRules(value as InvoiceRuleValue, ctx, 'create'))

/**
 * Update schema: all fields optional. Because `invoiceType` in the base
 * shape has `.default('VAT')` (for create), we explicitly override it to a
 * plain optional enum here — otherwise `.partial()` would still inject the
 * default and the superRefine would fire VAT rules on every partial PATCH.
 *
 * When a caller does supply `invoiceType` on the update, the same
 * cross-field rules run as on create. But callers must then also send the
 * dependent fields they're changing — a partial PATCH that only touches
 * the type is unlikely to be valid.
 */
export const ksefInvoiceUpdateSchema = z
  .object(baseInvoiceShape)
  .partial()
  .omit({ direction: true, externalInvoiceId: true })
  .extend({ invoiceType: ksefInvoiceTypeSchema.optional() })
  .superRefine((value, ctx) => {
    if (value.invoiceType !== undefined) {
      applyInvoiceTypeRules(value as InvoiceRuleValue, ctx, 'update')
    }
  })

export const ksefInvoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  direction: ksefInvoiceDirectionSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

export type KsefInvoiceCreateDto = z.infer<typeof ksefInvoiceCreateSchema>
export type KsefInvoiceUpdateDto = z.infer<typeof ksefInvoiceUpdateSchema>
export type KsefInvoiceLineItemDto = z.infer<typeof ksefInvoiceLineItemSchema>
export type KsefInvoiceOrderLineDto = z.infer<typeof ksefInvoiceOrderLineSchema>
export type KsefInvoiceAdvanceRefDto = z.infer<typeof ksefInvoiceAdvanceRefSchema>
export type KsefInvoiceListQueryDto = z.infer<typeof ksefInvoiceListQuerySchema>
