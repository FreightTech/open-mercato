import type { APIRequestContext } from '@playwright/test'
import { apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import { readJsonSafe } from '@open-mercato/core/modules/core/__integration__/helpers/generalFixtures'

export type KsefInvoiceType =
  | 'VAT'
  | 'KOR'
  | 'ZAL'
  | 'ROZ'
  | 'UPR'
  | 'KOR_ZAL'
  | 'KOR_ROZ'

export interface KsefTestLineItem {
  lineNumber?: number
  description?: string
  quantity?: string | number
  unit?: string | null
  unitPriceNet?: string | number
  netAmount?: string | number
  vatAmount?: string | number
  vatRate?: string
  vatRateCode?: string | null
  gtuCode?: string | null
  isPreState?: boolean
}

export interface KsefTestOrderLine {
  lineNumber?: number
  description?: string
  unit?: string | null
  quantity?: string | number
  netAmount?: string | number
  vatAmount?: string | number
  vatRate?: string
}

export interface KsefTestAdvanceRef {
  ksefNumber?: string | null
  invoiceNumber?: string | null
  issueDate?: string | null
  advanceAmount?: string | number | null
}

export interface KsefTestInvoicePayload {
  invoiceType?: KsefInvoiceType
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string | null
  serviceDate?: string | null
  sellerName?: string
  sellerTaxId?: string
  sellerAddress?: string
  sellerCountryCode?: string
  sellerBankAccount?: string | null
  buyerName?: string | null
  buyerTaxId?: string
  buyerAddress?: string | null
  buyerCountryCode?: string
  netAmount?: string
  vatAmount?: string
  grossAmount?: string
  currencyCode?: string
  paymentMethod?: string
  direction?: 'outgoing' | 'incoming'

  correctedKsefNumber?: string | null
  correctedInvoiceNumber?: string | null
  correctedInvoiceIssueDate?: string | null
  correctionReason?: string | null
  correctionEffectType?: 1 | 2 | null
  correctionPeriod?: string | null

  advanceAmount?: string | null
  orderTotalGross?: string | null
  isFinalAdvance?: boolean
  orderLines?: KsefTestOrderLine[]
  advanceRefs?: KsefTestAdvanceRef[]

  annotSplitPayment?: boolean
  annotReverseCharge?: boolean

  lineItems?: KsefTestLineItem[]
}

function defaultLineItem(lineNumber = 1): Required<KsefTestLineItem> {
  return {
    lineNumber,
    description: 'Usługa transportowa',
    quantity: '1',
    unit: 'szt.',
    unitPriceNet: '1000.00',
    netAmount: '1000.00',
    vatAmount: '230.00',
    vatRate: '23',
    vatRateCode: null,
    gtuCode: null,
    isPreState: false,
  }
}

function defaultOrderLine(lineNumber = 1): Required<KsefTestOrderLine> {
  return {
    lineNumber,
    description: 'Pełne zlecenie transportowe',
    unit: 'szt.',
    quantity: '1',
    netAmount: '1000.00',
    vatAmount: '230.00',
    vatRate: '23',
  }
}

/**
 * Builds a KSeF invoice create payload with sensible defaults. Supply only
 * the overrides relevant to the test — line items/order lines are expanded
 * to the defaults when missing.
 */
export function makeKsefInvoicePayload(overrides: KsefTestInvoicePayload = {}): Record<string, unknown> {
  const invoiceType = overrides.invoiceType ?? 'VAT'
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

  const payload: Record<string, unknown> = {
    invoiceNumber: overrides.invoiceNumber ?? `QA-${invoiceType}-${suffix}`,
    invoiceDate: overrides.invoiceDate ?? new Date().toISOString().slice(0, 10),
    dueDate: overrides.dueDate ?? null,
    serviceDate: overrides.serviceDate ?? null,
    direction: overrides.direction ?? 'outgoing',
    invoiceType,
    currencyCode: overrides.currencyCode ?? 'PLN',
    paymentMethod: overrides.paymentMethod ?? '1',
    sellerName: overrides.sellerName ?? 'QA Test Spółka z o.o.',
    sellerTaxId: overrides.sellerTaxId ?? '7980332920',
    sellerAddress: overrides.sellerAddress ?? 'ul. Testowa 1\n00-001 Warszawa',
    sellerCountryCode: overrides.sellerCountryCode ?? 'PL',
    sellerBankAccount: overrides.sellerBankAccount ?? null,
    buyerName: overrides.buyerName === undefined ? 'QA Kupiec S.A.' : overrides.buyerName,
    buyerTaxId: overrides.buyerTaxId ?? '5261040828',
    buyerAddress: overrides.buyerAddress === undefined ? 'ul. Handlowa 5\n31-001 Kraków' : overrides.buyerAddress,
    buyerCountryCode: overrides.buyerCountryCode ?? 'PL',
    netAmount: overrides.netAmount ?? '1000.00',
    vatAmount: overrides.vatAmount ?? '230.00',
    grossAmount: overrides.grossAmount ?? '1230.00',
    lineItems: overrides.lineItems !== undefined
      ? overrides.lineItems.map((li, idx) => ({ ...defaultLineItem(idx + 1), ...li }))
      : [defaultLineItem(1)],
  }

  if (overrides.correctedKsefNumber !== undefined) payload.correctedKsefNumber = overrides.correctedKsefNumber
  if (overrides.correctedInvoiceNumber !== undefined) payload.correctedInvoiceNumber = overrides.correctedInvoiceNumber
  if (overrides.correctedInvoiceIssueDate !== undefined) payload.correctedInvoiceIssueDate = overrides.correctedInvoiceIssueDate
  if (overrides.correctionReason !== undefined) payload.correctionReason = overrides.correctionReason
  if (overrides.correctionEffectType !== undefined) payload.correctionEffectType = overrides.correctionEffectType
  if (overrides.correctionPeriod !== undefined) payload.correctionPeriod = overrides.correctionPeriod

  if (overrides.advanceAmount !== undefined) payload.advanceAmount = overrides.advanceAmount
  if (overrides.orderTotalGross !== undefined) payload.orderTotalGross = overrides.orderTotalGross
  if (overrides.isFinalAdvance !== undefined) payload.isFinalAdvance = overrides.isFinalAdvance
  if (overrides.orderLines !== undefined) {
    payload.orderLines = overrides.orderLines.map((ol, idx) => ({ ...defaultOrderLine(idx + 1), ...ol }))
  }
  if (overrides.advanceRefs !== undefined) {
    payload.advanceRefs = overrides.advanceRefs.map((ar) => ({
      ksefNumber: ar.ksefNumber ?? null,
      invoiceNumber: ar.invoiceNumber ?? null,
      issueDate: ar.issueDate ?? null,
      advanceAmount: ar.advanceAmount ?? null,
    }))
  }
  if (overrides.annotSplitPayment !== undefined) payload.annotSplitPayment = overrides.annotSplitPayment
  if (overrides.annotReverseCharge !== undefined) payload.annotReverseCharge = overrides.annotReverseCharge

  return payload
}

export async function createKsefInvoiceFixture(
  request: APIRequestContext,
  token: string,
  overrides: KsefTestInvoicePayload = {},
): Promise<string> {
  const response = await apiRequest(request, 'POST', '/api/ksef/invoices', {
    token,
    data: makeKsefInvoicePayload(overrides),
  })
  if (!response.ok()) {
    const body = await readJsonSafe<Record<string, unknown>>(response)
    throw new Error(
      `createKsefInvoiceFixture failed (${response.status()}): ${JSON.stringify(body)}`,
    )
  }
  const body = (await response.json()) as { id?: string }
  if (!body.id) throw new Error('createKsefInvoiceFixture: response did not include id')
  return body.id
}

export async function deleteKsefInvoiceIfExists(
  request: APIRequestContext,
  token: string | null,
  invoiceId: string | null,
): Promise<void> {
  if (!token || !invoiceId) return
  try {
    await apiRequest(request, 'DELETE', `/api/ksef/invoices/${invoiceId}`, { token })
  } catch {
    // best effort — never throw during cleanup
  }
}

export async function getKsefInvoice(
  request: APIRequestContext,
  token: string,
  invoiceId: string,
): Promise<Record<string, unknown>> {
  const response = await apiRequest(request, 'GET', `/api/ksef/invoices/${invoiceId}`, { token })
  if (!response.ok()) {
    throw new Error(`getKsefInvoice failed (${response.status()})`)
  }
  return (await response.json()) as Record<string, unknown>
}

export async function generateKsefInvoiceXml(
  request: APIRequestContext,
  token: string,
  invoiceId: string,
): Promise<string> {
  const response = await apiRequest(request, 'POST', `/api/ksef/generate-xml/${invoiceId}`, { token })
  if (!response.ok()) {
    const body = await readJsonSafe<Record<string, unknown>>(response)
    throw new Error(`generateKsefInvoiceXml failed (${response.status()}): ${JSON.stringify(body)}`)
  }
  const body = (await response.json()) as { xml?: string }
  if (!body.xml) throw new Error('generateKsefInvoiceXml: response did not include xml')
  return body.xml
}
