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

export type KsefStatus =
  | 'none'
  | 'queued'
  | 'submitted'
  | 'processing'
  | 'accepted'
  | 'upo_downloaded'
  | 'rejected'
  | 'error'
  | 'cancelled'

export type KsefSessionType = 'interactive' | 'batch'

export type KsefSessionStatus =
  | 'initializing'
  | 'active'
  | 'closing'
  | 'closed'
  | 'error'

export type KsefAuthType = 'token' | 'certificate'

export type KsefEnvironment = 'test' | 'demo' | 'production'

export type KsefSessionMode = 'interactive' | 'batch'

export type OfflineMode = 'online' | 'offline24' | 'unavailability' | 'emergency'

export type VatRateCode = '23' | '8' | '5' | '0' | 'zw' | 'oo' | 'np'
