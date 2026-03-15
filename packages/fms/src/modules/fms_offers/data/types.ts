// Offer Status
export const FMS_OFFER_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'declined',
  'expired',
  'superseded',
] as const
export type FmsOfferStatus = (typeof FMS_OFFER_STATUSES)[number]

// Direction
export const FMS_DIRECTIONS = ['import', 'export', 'both'] as const
export type FmsDirection = (typeof FMS_DIRECTIONS)[number]

// Incoterm (Incoterms 2020)
export const FMS_INCOTERMS = [
  'exw',
  'fca',
  'fob',
  'cfr',
  'cif',
  'cpt',
  'cip',
  'dap',
  'dpu',
  'ddp',
] as const
export type FmsIncoterm = (typeof FMS_INCOTERMS)[number]

// Charge Category
export const FMS_CHARGE_CATEGORIES = [
  'transport',
  'terminal',
  'surcharge',
  'inland',
  'customs',
  'charges',
  'other',
] as const
export type FmsChargeCategory = (typeof FMS_CHARGE_CATEGORIES)[number]

// Charge Unit / Charge Basis
export const FMS_CHARGE_UNITS = [
  'per_container',
  'per_shipment',
  'per_kg',
  'per_cbm',
  'per_bl',
  'per_day',
] as const
export type FmsChargeUnit = (typeof FMS_CHARGE_UNITS)[number]

// Container Types (Full range + LCL)
export const FMS_CONTAINER_TYPES = [
  '20GP',
  '40GP',
  '40HC',
  '45HC',
  '20RF',
  '40RF',
  '40RH',
  'LCL',
] as const
export type FmsContainerType = (typeof FMS_CONTAINER_TYPES)[number]

// RFQ Cargo Types
export const FMS_RFQ_CARGO_TYPES = ['general', 'dangerous', 'perishable', 'oog'] as const
export type FmsRfqCargoType = (typeof FMS_RFQ_CARGO_TYPES)[number]

// Transport Modes
export const FMS_TRANSPORT_MODES = ['sea', 'air', 'road', 'rail', 'barge'] as const
export type FmsTransportMode = (typeof FMS_TRANSPORT_MODES)[number]

// RFQ Status (lifecycle stages matching board columns)
export const FMS_RFQ_STATUSES = [
  'incoming',
  'in_progress',
  'waiting_for_client',
  'approved',
  'declined',
] as const
export type FmsRfqStatus = (typeof FMS_RFQ_STATUSES)[number]

// RFQ Highlight Types (for LLM text extraction annotations)
export const FMS_HIGHLIGHT_TYPES = [
  'location',
  'container',
  'cargo',
  'weight',
  'date',
  'company',
  'contact',
  'email',
  'incoterm',
] as const
export type FmsHighlightType = (typeof FMS_HIGHLIGHT_TYPES)[number]

export type RfqHighlight = {
  start: number
  end: number
  type: FmsHighlightType
  label: string
}

// Exchange Rate Snapshot (stored in offer when lines have multiple currencies)
export type ExchangeRateSnapshot = {
  fromCurrencyCode: string
  toCurrencyCode: string
  rate: string
  date: string
  source: string
}
