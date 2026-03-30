import {
  Collection,
  Entity,
  Index,
  OneToMany,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'
import type {
  InvoiceDirection,
  InvoiceSourceType,
  InvoiceStatus,
  InvoiceTypeCode,
  KsefStatus,
  KsefSessionType,
  KsefSessionStatus,
  KsefAuthType,
  KsefEnvironment,
  KsefSessionMode,
  OfflineMode,
  VatRateCode,
} from './types'

// ========================================
// InvoicingInvoice
// ========================================

@Entity({ tableName: 'invoicing_invoices' })
@Index({ name: 'invoicing_invoices_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'invoicing_invoices_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'invoicing_invoices_ksef_status_idx', properties: ['organizationId', 'tenantId', 'ksefStatus'] })
@Index({ name: 'invoicing_invoices_seller_tax_idx', properties: ['organizationId', 'tenantId', 'sellerTaxId'] })
@Index({ name: 'invoicing_invoices_date_idx', properties: ['organizationId', 'tenantId', 'invoiceDate'] })
@Index({ name: 'invoicing_invoices_source_doc_idx', properties: ['sourceDocumentInvoiceId'] })
@Index({ name: 'invoicing_invoices_source_sales_idx', properties: ['sourceSalesInvoiceId'] })
@Index({ name: 'invoicing_invoices_corrected_idx', properties: ['correctedInvoiceId'] })
export class InvoicingInvoice {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
    | 'direction'
    | 'sourceType'
    | 'status'
    | 'ksefStatus'
    | 'currencyCode'
    | 'netAmount'
    | 'vatAmount'
    | 'grossAmount'
    | 'invoiceType'
    | 'offlineMode'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // -- Invoice identification --

  @Property({ name: 'invoice_number', type: 'text' })
  invoiceNumber!: string

  @Property({ name: 'invoice_date', type: 'date', nullable: true })
  invoiceDate?: Date | null

  @Property({ name: 'due_date', type: 'date', nullable: true })
  dueDate?: Date | null

  @Property({ name: 'service_date', type: 'date', nullable: true })
  serviceDate?: Date | null

  // -- Seller party --

  @Property({ name: 'seller_name', type: 'text', nullable: true })
  sellerName?: string | null

  @Property({ name: 'seller_tax_id', type: 'text', nullable: true })
  sellerTaxId?: string | null

  @Property({ name: 'seller_address', type: 'text', nullable: true })
  sellerAddress?: string | null

  @Property({ name: 'seller_country_code', type: 'text', nullable: true })
  sellerCountryCode?: string | null

  @Property({ name: 'seller_bank_account', type: 'text', nullable: true })
  sellerBankAccount?: string | null

  // -- Buyer party --

  @Property({ name: 'buyer_name', type: 'text', nullable: true })
  buyerName?: string | null

  @Property({ name: 'buyer_tax_id', type: 'text', nullable: true })
  buyerTaxId?: string | null

  @Property({ name: 'buyer_address', type: 'text', nullable: true })
  buyerAddress?: string | null

  @Property({ name: 'buyer_country_code', type: 'text', nullable: true })
  buyerCountryCode?: string | null

  // -- Amounts --

  @Property({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  netAmount: string = '0'

  @Property({ name: 'vat_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  vatAmount: string = '0'

  @Property({ name: 'gross_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  grossAmount: string = '0'

  @Property({ name: 'currency_code', type: 'text', default: 'PLN' })
  currencyCode: string = 'PLN'

  // -- Payment --

  @Property({ name: 'payment_method', type: 'text', nullable: true })
  paymentMethod?: string | null

  @Property({ name: 'payment_terms', type: 'text', nullable: true })
  paymentTerms?: string | null

  // -- Direction & source --

  @Property({ type: 'text', default: 'outgoing' })
  direction: InvoiceDirection = 'outgoing'

  @Property({ name: 'source_type', type: 'text', default: 'manual' })
  sourceType: InvoiceSourceType = 'manual'

  @Property({ name: 'source_document_invoice_id', type: 'uuid', nullable: true })
  sourceDocumentInvoiceId?: string | null

  @Property({ name: 'source_sales_invoice_id', type: 'uuid', nullable: true })
  sourceSalesInvoiceId?: string | null

  @Property({ name: 'source_import_reference', type: 'text', nullable: true })
  sourceImportReference?: string | null

  @Property({ name: 'source_document_id', type: 'uuid', nullable: true })
  sourceDocumentId?: string | null

  @Property({ name: 'attachment_id', type: 'uuid', nullable: true })
  attachmentId?: string | null

  // -- Business status --

  @Property({ type: 'text', default: 'draft' })
  status: InvoiceStatus = 'draft'

  // -- Invoice type (correction support) --

  @Property({ name: 'invoice_type', type: 'text', default: 'VAT' })
  invoiceType: InvoiceTypeCode = 'VAT'

  @Property({ name: 'corrected_invoice_id', type: 'uuid', nullable: true })
  correctedInvoiceId?: string | null

  @Property({ name: 'correction_reason', type: 'text', nullable: true })
  correctionReason?: string | null

  // -- Offline mode --

  @Property({ name: 'offline_mode', type: 'text', nullable: true })
  offlineMode?: OfflineMode | null

  @Property({ name: 'offline_qr_data', type: 'text', nullable: true })
  offlineQrData?: string | null

  // -- KSeF fields --

  @Property({ name: 'ksef_status', type: 'text', default: 'none' })
  ksefStatus: KsefStatus = 'none'

  @Property({ name: 'ksef_number', type: 'text', nullable: true })
  @Index({ name: 'invoicing_invoices_ksef_number_idx' })
  @Unique({ name: 'invoicing_invoices_ksef_number_uniq' })
  ksefNumber?: string | null

  @Property({ name: 'ksef_session_id', type: 'uuid', nullable: true })
  ksefSessionId?: string | null

  @Property({ name: 'ksef_submitted_at', type: 'timestamptz', nullable: true })
  ksefSubmittedAt?: Date | null

  @Property({ name: 'ksef_accepted_at', type: 'timestamptz', nullable: true })
  ksefAcceptedAt?: Date | null

  @Property({ name: 'ksef_reference_number', type: 'text', nullable: true })
  ksefReferenceNumber?: string | null

  @Property({ name: 'ksef_fa_xml', type: 'text', nullable: true })
  ksefFaXml?: string | null

  @Property({ name: 'ksef_upo_xml', type: 'text', nullable: true })
  ksefUpoXml?: string | null

  @Property({ name: 'ksef_error_message', type: 'text', nullable: true })
  ksefErrorMessage?: string | null

  @Property({ name: 'ksef_error_code', type: 'text', nullable: true })
  ksefErrorCode?: string | null

  // -- Notes & metadata --

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null

  // -- Review --

  @Property({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null

  @Property({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null

  @Property({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes?: string | null

  // -- Audit --

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null

  @Property({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null

  // -- Relations --

  @OneToMany(() => InvoicingLineItem, (li) => li.invoice)
  lineItems = new Collection<InvoicingLineItem>(this)
}

// ========================================
// InvoicingLineItem
// ========================================

@Entity({ tableName: 'invoicing_line_items' })
@Index({ name: 'invoicing_line_items_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'invoicing_line_items_invoice_idx', properties: ['invoice'] })
export class InvoicingLineItem {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'quantity'
    | 'unitPriceNet'
    | 'vatRate'
    | 'netAmount'
    | 'vatAmount'
    | 'grossAmount'
    | 'sourceLineItemId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => InvoicingInvoice, { deleteRule: 'cascade' })
  invoice!: InvoicingInvoice

  @Property({ name: 'line_number', type: 'int' })
  lineNumber!: number

  @Property({ type: 'text' })
  description!: string

  @Property({ type: 'numeric', precision: 18, scale: 4, default: '1' })
  quantity: string = '1'

  @Property({ type: 'text', nullable: true })
  unit?: string | null

  @Property({ name: 'unit_price_net', type: 'numeric', precision: 18, scale: 4, default: '0' })
  unitPriceNet: string = '0'

  @Property({ name: 'vat_rate', type: 'numeric', precision: 5, scale: 2, default: '0' })
  vatRate: string = '0'

  @Property({ name: 'vat_rate_code', type: 'text', nullable: true })
  vatRateCode?: VatRateCode | null

  @Property({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  netAmount: string = '0'

  @Property({ name: 'vat_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  vatAmount: string = '0'

  @Property({ name: 'gross_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  grossAmount: string = '0'

  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'gtu_code', type: 'text', nullable: true })
  gtuCode?: string | null

  @Property({ name: 'pkwiu_code', type: 'text', nullable: true })
  pkwiuCode?: string | null

  @Property({ name: 'source_line_item_id', type: 'uuid', nullable: true })
  sourceLineItemId?: string | null

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// InvoicingKsefSession
// ========================================

@Entity({ tableName: 'invoicing_ksef_sessions' })
@Index({ name: 'invoicing_ksef_sessions_scope_idx', properties: ['organizationId', 'tenantId'] })
export class InvoicingKsefSession {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'sessionStatus'
    | 'invoiceCount'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'session_type', type: 'text' })
  sessionType!: KsefSessionType

  @Property({ name: 'session_status', type: 'text', default: 'initializing' })
  sessionStatus: KsefSessionStatus = 'initializing'

  @Property({ name: 'ksef_reference_number', type: 'text', nullable: true })
  ksefReferenceNumber?: string | null

  @Property({ name: 'session_token', type: 'text', nullable: true })
  sessionToken?: string | null

  @Property({ name: 'encryption_key', type: 'text', nullable: true })
  encryptionKey?: string | null

  @Property({ name: 'encryption_iv', type: 'text', nullable: true })
  encryptionIv?: string | null

  @Property({ type: 'text' })
  nip!: string

  @Property({ name: 'invoice_count', type: 'int', default: 0 })
  invoiceCount: number = 0

  @Property({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null

  @Property({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt?: Date | null

  @Property({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null

  @Property({ name: 'upo_xml', type: 'text', nullable: true })
  upoXml?: string | null

  @Property({ name: 'upo_downloaded_at', type: 'timestamptz', nullable: true })
  upoDownloadedAt?: Date | null

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// InvoicingKsefCredential
// ========================================

@Entity({ tableName: 'invoicing_ksef_credentials' })
@Index({ name: 'invoicing_ksef_credentials_scope_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'invoicing_ksef_credentials_nip_env_uniq',
  properties: ['organizationId', 'tenantId', 'nip', 'environment'],
})
export class InvoicingKsefCredential {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'environment'
    | 'isActive'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  nip!: string

  @Property({ name: 'auth_type', type: 'text' })
  authType!: KsefAuthType

  @Property({ name: 'ksef_token', type: 'text', nullable: true })
  ksefToken?: string | null

  @Property({ name: 'certificate_pem', type: 'text', nullable: true })
  certificatePem?: string | null

  @Property({ name: 'private_key_pem', type: 'text', nullable: true })
  privateKeyPem?: string | null

  @Property({ type: 'text', default: 'test' })
  environment: KsefEnvironment = 'test'

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ type: 'text', nullable: true })
  label?: string | null

  @Property({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt?: Date | null

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// InvoicingSettings
// ========================================

@Entity({ tableName: 'invoicing_settings' })
@Index({ name: 'invoicing_settings_scope_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'invoicing_settings_tenant_uniq',
  properties: ['organizationId', 'tenantId'],
})
export class InvoicingSettings {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'ksefEnvironment'
    | 'ksefAutoSubmit'
    | 'ksefSessionMode'
    | 'autoImportFromDocuments'
    | 'autoImportFromSales'
    | 'offlineMode'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'ksef_environment', type: 'text', default: 'test' })
  ksefEnvironment: KsefEnvironment = 'test'

  @Property({ name: 'ksef_auto_submit', type: 'boolean', default: false })
  ksefAutoSubmit: boolean = false

  @Property({ name: 'ksef_session_mode', type: 'text', default: 'batch' })
  ksefSessionMode: KsefSessionMode = 'batch'

  @Property({ name: 'default_seller_name', type: 'text', nullable: true })
  defaultSellerName?: string | null

  @Property({ name: 'default_seller_nip', type: 'text', nullable: true })
  defaultSellerNip?: string | null

  @Property({ name: 'default_seller_address', type: 'text', nullable: true })
  defaultSellerAddress?: string | null

  @Property({ name: 'default_seller_country_code', type: 'text', nullable: true })
  defaultSellerCountryCode?: string | null

  @Property({ name: 'default_seller_bank_account', type: 'text', nullable: true })
  defaultSellerBankAccount?: string | null

  @Property({ name: 'default_payment_method', type: 'text', nullable: true })
  defaultPaymentMethod?: string | null

  @Property({ name: 'auto_import_from_documents', type: 'boolean', default: true })
  autoImportFromDocuments: boolean = true

  @Property({ name: 'auto_import_from_sales', type: 'boolean', default: false })
  autoImportFromSales: boolean = false

  @Property({ name: 'offline_mode', type: 'text', default: 'online' })
  offlineMode: OfflineMode = 'online'

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
