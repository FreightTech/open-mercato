import { Collection, OptionalProps } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OneToMany, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import type {
  KsefSubmissionStatus,
  KsefSessionType,
  KsefSessionStatus,
  KsefInvoiceDirection,
  OfflineMode,
} from './types'

// ========================================
// KsefSubmission
// ========================================

@Entity({ tableName: 'ksef_submissions' })
@Index({ name: 'ksef_submissions_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'ksef_submissions_invoice_idx', properties: ['invoiceId'] })
@Index({ name: 'ksef_submissions_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
export class KsefSubmission {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'status'
    | 'ksefInvoiceId'
    | 'invoiceId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // Link to KSeF-owned invoice (primary link for standalone mode)
  @Property({ name: 'ksef_invoice_id', type: 'uuid', nullable: true })
  @Index({ name: 'ksef_submissions_ksef_invoice_idx' })
  ksefInvoiceId?: string | null

  // Link to external invoice (for bridge mode with fms_invoicing or other invoice modules)
  @Property({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId?: string | null

  // -- KSeF state --

  @Property({ type: 'text', default: 'none' })
  status: KsefSubmissionStatus = 'none'

  @Property({ name: 'ksef_number', type: 'text', nullable: true })
  @Index({ name: 'ksef_submissions_ksef_number_idx' })
  @Unique({ name: 'ksef_submissions_ksef_number_uniq' })
  ksefNumber?: string | null

  @Property({ name: 'ksef_reference_number', type: 'text', nullable: true })
  ksefReferenceNumber?: string | null

  @Property({ name: 'ksef_session_id', type: 'uuid', nullable: true })
  ksefSessionId?: string | null

  @Property({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date | null

  @Property({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date | null

  // -- XML storage --

  @Property({ name: 'fa_xml', type: 'text', nullable: true })
  faXml?: string | null

  @Property({ name: 'upo_xml', type: 'text', nullable: true })
  upoXml?: string | null

  // -- Error state --

  @Property({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null

  @Property({ name: 'error_code', type: 'text', nullable: true })
  errorCode?: string | null

  // -- Offline mode --

  @Property({ name: 'offline_mode', type: 'text', nullable: true })
  offlineMode?: OfflineMode | null

  @Property({ name: 'offline_qr_data', type: 'text', nullable: true })
  offlineQrData?: string | null

  // -- Audit --

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// KsefSession
// ========================================

@Entity({ tableName: 'ksef_sessions' })
@Index({ name: 'ksef_sessions_scope_idx', properties: ['organizationId', 'tenantId'] })
export class KsefSession {
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

  @Property({ name: 'refresh_token', type: 'text', nullable: true })
  refreshToken?: string | null

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
// KsefInvoice
// ========================================

@Entity({ tableName: 'ksef_invoices' })
@Index({ name: 'ksef_invoices_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'ksef_invoices_direction_idx', properties: ['organizationId', 'tenantId', 'direction'] })
@Index({ name: 'ksef_invoices_external_idx', properties: ['externalInvoiceId'] })
export class KsefInvoice {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'netAmount'
    | 'vatAmount'
    | 'grossAmount'
    | 'currencyCode'
    | 'invoiceType'
    | 'direction'
    | 'isFinalAdvance'
    | 'annotCashAccounting'
    | 'annotSelfBilling'
    | 'annotReverseCharge'
    | 'annotSplitPayment'
    | 'annotIntraCommunitySupply'
    | 'annotExportOfServices'
    | 'annotNewTransportMeans'

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

  // -- Payment & type --

  @Property({ name: 'payment_method', type: 'text', nullable: true })
  paymentMethod?: string | null

  @Property({ name: 'invoice_type', type: 'text', default: 'VAT' })
  invoiceType: string = 'VAT'

  // -- Correction (KOR family) --
  // `correctedInvoiceId` is a local UUID link (legacy). Prefer the stable
  // KSeF-number-based references below for FA(3) `DaneFaKorygowanej` output.

  @Property({ name: 'corrected_invoice_id', type: 'uuid', nullable: true })
  correctedInvoiceId?: string | null

  @Property({ name: 'correction_reason', type: 'text', nullable: true })
  correctionReason?: string | null

  @Property({ name: 'corrected_ksef_number', type: 'text', nullable: true })
  correctedKsefNumber?: string | null

  @Property({ name: 'corrected_invoice_number', type: 'text', nullable: true })
  correctedInvoiceNumber?: string | null

  @Property({ name: 'corrected_invoice_issue_date', type: 'date', nullable: true })
  correctedInvoiceIssueDate?: Date | null

  @Property({ name: 'correction_effect_type', type: 'smallint', nullable: true })
  correctionEffectType?: number | null

  @Property({ name: 'correction_period', type: 'text', nullable: true })
  correctionPeriod?: string | null

  // -- Advance (ZAL) / order (Zamowienie) --

  @Property({ name: 'advance_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  advanceAmount?: string | null

  @Property({ name: 'order_total_gross', type: 'numeric', precision: 18, scale: 2, nullable: true })
  orderTotalGross?: string | null

  @Property({ name: 'is_final_advance', type: 'boolean', default: false })
  isFinalAdvance: boolean = false

  // -- Foreign currency → PLN conversion (P_14_xW) --

  @Property({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 6, nullable: true })
  exchangeRate?: string | null

  @Property({ name: 'exchange_rate_date', type: 'date', nullable: true })
  exchangeRateDate?: Date | null

  // -- FA(3) annotations (Adnotacje) --

  @Property({ name: 'annot_cash_accounting', type: 'boolean', default: false })
  annotCashAccounting: boolean = false

  @Property({ name: 'annot_self_billing', type: 'boolean', default: false })
  annotSelfBilling: boolean = false

  @Property({ name: 'annot_reverse_charge', type: 'boolean', default: false })
  annotReverseCharge: boolean = false

  @Property({ name: 'annot_split_payment', type: 'boolean', default: false })
  annotSplitPayment: boolean = false

  @Property({ name: 'annot_intra_community_supply', type: 'boolean', default: false })
  annotIntraCommunitySupply: boolean = false

  @Property({ name: 'annot_export_of_services', type: 'boolean', default: false })
  annotExportOfServices: boolean = false

  @Property({ name: 'annot_new_transport_means', type: 'boolean', default: false })
  annotNewTransportMeans: boolean = false

  // -- Direction --

  @Property({ type: 'text', default: 'outgoing' })
  direction: KsefInvoiceDirection = 'outgoing'

  // -- Bridge linking (optional: external invoice module ID) --

  @Property({ name: 'external_invoice_id', type: 'uuid', nullable: true })
  externalInvoiceId?: string | null

  // -- Line items --

  @OneToMany(() => KsefInvoiceLineItem, (li) => li.invoice)
  lineItems = new Collection<KsefInvoiceLineItem>(this)

  // -- Order lines (Zamowienie, used by ZAL and KOR_ZAL) --

  @OneToMany(() => KsefInvoiceOrderLine, (ol) => ol.invoice)
  orderLines = new Collection<KsefInvoiceOrderLine>(this)

  // -- Advance references (FakturaZaliczkowa refs on ROZ and last-ZAL) --

  @OneToMany(() => KsefInvoiceAdvanceRef, (ar) => ar.invoice)
  advanceRefs = new Collection<KsefInvoiceAdvanceRef>(this)

  // -- Soft delete --

  @Property({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null

  // -- Audit --
  // NOTE: Invoice workflow (draft → approved → submitted) can be added here later
  // by introducing a `status` column with transitions and validation gates.

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// KsefCompanyProfileRecord
// ========================================

@Entity({ tableName: 'ksef_company_profiles' })
@Index({ name: 'ksef_company_profiles_tenant_idx', properties: ['tenantId'] })
@Unique({ name: 'ksef_company_profiles_tenant_uniq', properties: ['tenantId'] })
export class KsefCompanyProfileRecord {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'organizationId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null

  @Property({ type: 'text' })
  nip!: string

  @Property({ name: 'profile_data', type: 'json' })
  profileData!: Record<string, unknown>

  @Property({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt!: Date

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// KsefInvoiceLineItem
// ========================================

@Entity({ tableName: 'ksef_invoice_line_items' })
@Index({ name: 'ksef_invoice_line_items_invoice_idx', properties: ['invoiceId'] })
export class KsefInvoiceLineItem {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'invoiceId'
    | 'isPreState'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => KsefInvoice, { name: 'invoice_id' })
  invoice!: KsefInvoice

  @Property({ name: 'invoice_id', type: 'uuid', persist: false })
  invoiceId!: string

  @Property({ name: 'line_number', type: 'int' })
  lineNumber!: number

  @Property({ type: 'text' })
  description!: string

  @Property({ type: 'numeric', precision: 18, scale: 4 })
  quantity!: string

  @Property({ type: 'text', nullable: true })
  unit?: string | null

  @Property({ name: 'unit_price_net', type: 'numeric', precision: 18, scale: 2 })
  unitPriceNet!: string

  @Property({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2 })
  netAmount!: string

  @Property({ name: 'vat_amount', type: 'numeric', precision: 18, scale: 2 })
  vatAmount!: string

  @Property({ name: 'vat_rate', type: 'text' })
  vatRate!: string

  @Property({ name: 'vat_rate_code', type: 'text', nullable: true })
  vatRateCode?: string | null

  @Property({ name: 'gtu_code', type: 'text', nullable: true })
  gtuCode?: string | null

  // For KOR using the StanPrzed (before/after) method: lines flagged `true`
  // represent the pre-correction state and are treated with opposite sign.
  @Property({ name: 'is_pre_state', type: 'boolean', default: false })
  isPreState: boolean = false

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// KsefInvoiceOrderLine (Zamowienie)
// ========================================

@Entity({ tableName: 'ksef_invoice_order_lines' })
@Index({ name: 'ksef_invoice_order_lines_invoice_idx', properties: ['invoiceId'] })
export class KsefInvoiceOrderLine {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'invoiceId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => KsefInvoice, { name: 'invoice_id' })
  invoice!: KsefInvoice

  @Property({ name: 'invoice_id', type: 'uuid', persist: false })
  invoiceId!: string

  @Property({ name: 'line_number', type: 'int' })
  lineNumber!: number

  @Property({ type: 'text' })
  description!: string

  @Property({ type: 'text', nullable: true })
  unit?: string | null

  @Property({ type: 'numeric', precision: 18, scale: 4 })
  quantity!: string

  @Property({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2 })
  netAmount!: string

  @Property({ name: 'vat_amount', type: 'numeric', precision: 18, scale: 2 })
  vatAmount!: string

  @Property({ name: 'vat_rate', type: 'text' })
  vatRate!: string

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// KsefInvoiceAdvanceRef (FakturaZaliczkowa references)
// ========================================

@Entity({ tableName: 'ksef_invoice_advance_refs' })
@Index({ name: 'ksef_invoice_advance_refs_invoice_idx', properties: ['invoiceId'] })
export class KsefInvoiceAdvanceRef {
  [OptionalProps]?:
    | 'createdAt'
    | 'invoiceId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => KsefInvoice, { name: 'invoice_id' })
  invoice!: KsefInvoice

  @Property({ name: 'invoice_id', type: 'uuid', persist: false })
  invoiceId!: string

  // Exactly one of the two reference fields must be populated.
  // `ksefNumber` is the preferred value (advance invoice issued in KSeF);
  // `invoiceNumber` is used only for legacy advances issued outside KSeF.
  @Property({ name: 'ksef_number', type: 'text', nullable: true })
  ksefNumber?: string | null

  @Property({ name: 'invoice_number', type: 'text', nullable: true })
  invoiceNumber?: string | null

  @Property({ name: 'issue_date', type: 'date', nullable: true })
  issueDate?: Date | null

  @Property({ name: 'advance_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  advanceAmount?: string | null

  @Property({ name: 'created_at', type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date()
}
