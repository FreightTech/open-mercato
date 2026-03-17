import type React from 'react'
import type { ChargeRow } from '../components/ChargesTable'

export type ExtractionResult = {
  extraction: {
    companyName?: string | null
    contactPerson?: string | null
    senderEmail?: string | null
    direction?: string | null
    summary?: string | null
    confidence?: number
    items: Array<{
      containerType?: string | null
      containerCount?: number | null
      origin?: string | null
      destination?: string | null
      cargoDescription?: string | null
      weightKg?: number | null
      readinessDate?: string | null
      incoterm?: string | null
      transportMode?: string | null
      notes?: string | null
    }>
    highlights: Array<{
      start: number
      end: number
      type: string
      label: string
    }>
  }
  model: string
  tokens: number
}

export type WizardItem = {
  containerType: string | null
  containerCount: number | null
  origin: string | null
  originLocationId: string | null
  destination: string | null
  destinationLocationId: string | null
  placeOfLoading: string | null
  placeOfLoadingId: string | null
  placeOfDelivery: string | null
  placeOfDeliveryId: string | null
  cargoDescription: string | null
  weightKg: number | null
  readinessDate: string | null
  incoterm: string | null
  transportMode: string | null
  notes: string | null
}

export type ProductItem = {
  id: string
  name: string
  chargeCode?: string | null
  chargeUnit?: string | null
}

export type LocationItem = {
  id: string
  name: string
  code?: string | null
}

export type RfqDetailData = {
  title: string | null
  contractorId: string | null
  origin: string | null
  destination: string | null
  transportMode: string | null
  direction: string | null
  offers: Array<{ id: string; offerNumber: string; status: string; version: number; createdAt: string }>
  items: Array<{
    id: string
    itemNumber: number
    containerType: string | null
    containerCount: number | null
    origin: string | null
    destination: string | null
    originLocationId: string | null
    destinationLocationId: string | null
    cargoDescription: string | null
    weightKg: string | null
    readinessDate: string | null
    incoterm: string | null
    transportMode: string | null
    notes: string | null
  }>
  rawText: string | null
  senderEmail: string | null
  senderName: string | null
  companyName: string | null
  contactPerson: string | null
  extractedData: Record<string, unknown> | null
  highlights: Array<{ start: number; end: number; type: string; label: string }> | null
  context: string | null
}

export type OfferLineData = {
  id: string
  lineNumber: number
  productId?: string | null
  productName: string | null
  chargeCode: string | null
  chargeBasis: string | null
  containerType?: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  isEnabled: boolean
}

export type OfferCalcData = {
  id: string
  lines: OfferLineData[]
}

export type OfferFullData = {
  id: string
  offerNumber: string
  status: string
  version: number
  createdAt: string
  validUntil: string | null
  transportMode: string | null
  calculations: OfferCalcData[]
}

export function makeEmptyItem(): WizardItem {
  return {
    containerType: null,
    containerCount: null,
    origin: null,
    originLocationId: null,
    destination: null,
    destinationLocationId: null,
    placeOfLoading: null,
    placeOfLoadingId: null,
    placeOfDelivery: null,
    placeOfDeliveryId: null,
    cargoDescription: null,
    weightKg: null,
    readinessDate: null,
    incoterm: null,
    transportMode: null,
    notes: null,
  }
}

export function offerLineToChargeRow(line: OfferLineData): ChargeRow {
  return {
    id: line.id,
    productId: line.productId || null,
    productName: line.productName || '',
    chargeCode: line.chargeCode || '',
    chargeBasis: line.chargeBasis || '',
    containerType: line.containerType || null,
    currencyCode: line.currencyCode,
    rate: parseFloat(line.rate) || 0,
    marginPercent: 0,
    buyPrice: parseFloat(line.buyPrice) || 0,
    sellPrice: parseFloat(line.sellPrice) || 0,
    isEnabled: line.isEnabled,
  }
}

export function normalizeToLowerEnum<T extends string>(
  value: string | null | undefined,
  validValues: readonly T[],
): T | null {
  if (!value) return null
  const lower = value.toLowerCase().trim() as T
  return validValues.includes(lower) ? lower : null
}

export async function resolveLocation(name: string): Promise<{ id: string; name: string } | null> {
  if (!name) return null
  const { apiCall } = await import('@open-mercato/ui/backend/utils/apiCall')
  const params = new URLSearchParams({ q: name, limit: '5' })
  const res = await apiCall<{ items?: LocationItem[] }>(`/api/fms_locations/locations?${params}`)
  const items = res.result?.items || []
  if (items.length === 0) return null
  const exact = items.find((loc) => loc.name.toLowerCase() === name.toLowerCase())
  return exact ? { id: exact.id, name: exact.name } : { id: items[0].id, name: items[0].name }
}

export const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '8px',
}
