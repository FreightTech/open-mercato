export type InvoiceDirection = 'outgoing' | 'incoming'

export type InvoiceSourceType =
  | 'manual'
  | 'document_extraction'
  | 'sales_import'
  | 'external_import'
  | 'ksef_received'

export type InvoiceStatus =
  | 'draft'
  | 'extracted'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'paid'
  | 'cancelled'

export type InvoiceTypeCode = 'VAT' | 'KOR' | 'KOR_ZAL' | 'KOR_ROZ' | 'ZAL' | 'ROZ' | 'UPR'

export type VatRateCode = '23' | '8' | '5' | '0' | 'zw' | 'oo' | 'np'
