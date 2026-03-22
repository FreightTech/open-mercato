import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core'
import type { InvoiceStatus, ExtractionConfidence, InvoiceType, CostAllocationStatus } from './invoice-types'
import type { DocumentType, TransportationMetadata } from './schema-types'
import type { ProcessingStatus, ConsensusRecommendation } from '../services/pipeline/types'
import { FmsProduct } from '../../fms_products/data/entities'

export enum DocumentCategory {
  OFFER = 'offer',
  INVOICE = 'invoice',
  CUSTOMS_DECLARATION = 'customs_declaration',
  BILL_OF_LADING = 'bill_of_lading',
  BOOKING_CONFIRMATION = 'booking_confirmation',
  DELIVERY_NOTE = 'delivery_note',
  PACKING_LIST = 'packing_list',
  VGM_CERTIFICATE = 'vgm_certificate',
  OTHER = 'other',
}

@Entity({ tableName: 'fms_documents' })
@Index({ name: 'fms_documents_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_documents_category_idx', properties: ['category'] })
@Index({ name: 'fms_documents_attachment_idx', properties: ['attachmentId'] })
@Index({
  name: 'fms_documents_related_entity_idx',
  properties: ['relatedEntityId', 'relatedEntityType'],
})
export class FmsDocument {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
    | 'processingStatus'
    | 'children'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToMany(() => FmsDocumentPage, (page) => page.document)
  pages = new Collection<FmsDocumentPage>(this)

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ type: 'text', default: 'other' })
  category: DocumentCategory = DocumentCategory.OTHER

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'attachment_id', type: 'uuid' })
  attachmentId!: string

  @Property({ name: 'related_entity_id', type: 'uuid', nullable: true })
  relatedEntityId?: string | null

  @Property({ name: 'related_entity_type', type: 'text', nullable: true })
  relatedEntityType?: string | null

  @Property({ name: 'extracted_data', type: 'jsonb', nullable: true })
  extractedData?: Record<string, unknown> | null

  @Property({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date | null

  @Property({ name: 'processing_status', type: 'text', default: 'pending' })
  processingStatus: ProcessingStatus = 'pending'

  @Property({ name: 'processing_result', type: 'jsonb', nullable: true })
  processingResult?: Record<string, unknown> | null

  @Property({ name: 'consensus_confidence', type: 'numeric', precision: 3, scale: 2, nullable: true })
  consensusConfidence?: string | null

  @Property({ name: 'consensus_recommendation', type: 'text', nullable: true })
  consensusRecommendation?: ConsensusRecommendation | null

  @Property({ name: 'document_type', type: 'text', nullable: true })
  documentType?: DocumentType | null

  @Property({ name: 'document_type_confidence', type: 'int', nullable: true })
  documentTypeConfidence?: number | null

  // -- Identifiers (real columns, indexed, searchable) --

  @Property({ name: 'document_number', type: 'text', nullable: true })
  documentNumber?: string | null

  @Property({ name: 'document_date', type: 'date', nullable: true })
  documentDate?: Date | null

  @Property({ name: 'bl_number', type: 'text', nullable: true })
  @Index({ name: 'fms_documents_bl_number_idx' })
  blNumber?: string | null

  @Property({ name: 'mbl_number', type: 'text', nullable: true })
  @Index({ name: 'fms_documents_mbl_number_idx' })
  mblNumber?: string | null

  @Property({ name: 'booking_number', type: 'text', nullable: true })
  @Index({ name: 'fms_documents_booking_number_idx' })
  bookingNumber?: string | null

  @Property({ name: 'container_numbers', type: 'jsonb', nullable: true })
  containerNumbers?: string[] | null

  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'voyage_number', type: 'text', nullable: true })
  voyageNumber?: string | null

  @Property({ name: 'port_of_loading', type: 'text', nullable: true })
  portOfLoading?: string | null

  @Property({ name: 'port_of_discharge', type: 'text', nullable: true })
  portOfDischarge?: string | null

  @Property({ type: 'text', nullable: true })
  currency?: string | null

  @Property({ name: 'seller_name', type: 'text', nullable: true })
  sellerName?: string | null

  @Property({ name: 'buyer_name', type: 'text', nullable: true })
  buyerName?: string | null

  @Property({ name: 'total_gross_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  totalGrossAmount?: string | null

  // -- Data fields --

  @Property({ name: 'raw_text', type: 'text', nullable: true })
  rawText?: string | null

  @Property({ name: 'document_data', type: 'jsonb', nullable: true })
  documentData?: Record<string, unknown> | null

  // -- Edit tracking --

  @Property({ name: 'edited_by', type: 'uuid', nullable: true })
  editedBy?: string | null

  @Property({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt?: Date | null

  // -- Bundle support --

  @ManyToOne(() => FmsDocument, {
    fieldName: 'parent_document_id',
    deleteRule: 'set null',
    nullable: true,
  })
  @Index({ name: 'fms_documents_parent_idx' })
  parentDocument?: FmsDocument | null

  @OneToMany(() => FmsDocument, (doc) => doc.parentDocument)
  children = new Collection<FmsDocument>(this)

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
}

@Entity({ tableName: 'fms_document_pages' })
@Index({
  name: 'fms_document_pages_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_document_pages_document_idx',
  properties: ['document'],
})
export class FmsDocumentPage {
  [OptionalProps]?: 'createdAt' | 'storageDriver'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsDocument, { deleteRule: 'cascade' })
  document!: FmsDocument

  @Property({ name: 'page_number', type: 'int' })
  pageNumber!: number

  @Property({ name: 'storage_path', type: 'text' })
  storagePath!: string

  @Property({ name: 'storage_driver', type: 'text', default: 'local' })
  storageDriver: string = 'local'

  @Property({ type: 'int', nullable: true })
  width?: number | null

  @Property({ type: 'int', nullable: true })
  height?: number | null

  @Property({ name: 'file_size', type: 'int', nullable: true })
  fileSize?: number | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

// ========================================
// Invoice Entities (moved from fms_financials)
// ========================================

@Entity({ tableName: 'fms_invoices' })
@Index({
  name: 'fms_invoices_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_invoices_status_idx',
  properties: ['organizationId', 'tenantId', 'status'],
})
@Index({
  name: 'fms_invoices_seller_idx',
  properties: ['organizationId', 'tenantId', 'sellerName'],
})
@Index({
  name: 'fms_invoices_date_idx',
  properties: ['organizationId', 'tenantId', 'invoiceDate'],
})
export class FmsInvoice {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
    | 'currencyCode'
    | 'status'
    | 'documentType'
    | 'allocations'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // -- Cost management classification --

  @Property({ name: 'invoice_type', type: 'text', nullable: true })
  @Index({ name: 'fms_invoices_invoice_type_idx' })
  invoiceType?: InvoiceType | null

  @Property({ name: 'expense_category', type: 'text', nullable: true })
  expenseCategory?: string | null

  @Property({ name: 'expense_note', type: 'text', nullable: true })
  expenseNote?: string | null

  @Property({ name: 'document_id', type: 'uuid', nullable: true })
  @Index({ name: 'fms_invoices_document_id_idx' })
  documentId?: string | null

  @Property({ name: 'seller_contractor_id', type: 'uuid', nullable: true })
  @Index({ name: 'fms_invoices_seller_contractor_idx' })
  sellerContractorId?: string | null

  @Property({ name: 'buyer_contractor_id', type: 'uuid', nullable: true })
  buyerContractorId?: string | null

  @Property({ name: 'invoice_number', type: 'text', nullable: true })
  invoiceNumber?: string | null

  @Property({ name: 'invoice_date', type: 'date', nullable: true })
  invoiceDate?: Date | null

  @Property({ name: 'due_date', type: 'date', nullable: true })
  dueDate?: Date | null

  @Property({ name: 'service_date', type: 'date', nullable: true })
  serviceDate?: Date | null

  @Property({ name: 'seller_name', type: 'text', nullable: true })
  sellerName?: string | null

  @Property({ name: 'seller_tax_id', type: 'text', nullable: true })
  sellerTaxId?: string | null

  @Property({ name: 'seller_address', type: 'text', nullable: true })
  sellerAddress?: string | null

  @Property({ name: 'buyer_name', type: 'text', nullable: true })
  buyerName?: string | null

  @Property({ name: 'buyer_tax_id', type: 'text', nullable: true })
  buyerTaxId?: string | null

  @Property({ name: 'buyer_address', type: 'text', nullable: true })
  buyerAddress?: string | null

  @Property({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  netAmount: string = '0'

  @Property({ name: 'vat_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  vatAmount: string = '0'

  @Property({ name: 'gross_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  grossAmount: string = '0'

  @Property({ name: 'currency_code', type: 'text', default: 'PLN' })
  currencyCode: string = 'PLN'

  @Property({ name: 'attachment_id', type: 'uuid', nullable: true })
  attachmentId?: string | null

  @Property({ name: 'original_filename', type: 'text', nullable: true })
  originalFilename?: string | null

  @Property({ name: 'extracted_data', type: 'jsonb', nullable: true })
  extractedData?: Record<string, unknown> | null

  @Property({ name: 'extraction_confidence', type: 'text', nullable: true })
  extractionConfidence?: ExtractionConfidence | null

  @Property({ name: 'processed_at', type: Date, nullable: true })
  processedAt?: Date | null

  @Property({ name: 'document_type', type: 'text', default: 'invoice' })
  documentType: DocumentType = 'invoice'

  @Property({ name: 'document_type_confidence', type: 'int', nullable: true })
  documentTypeConfidence?: number | null

  @Property({ name: 'transportation_metadata', type: 'jsonb', nullable: true })
  transportationMetadata?: TransportationMetadata | null

  @Property({ name: 'bl_number', type: 'text', nullable: true })
  @Index({ name: 'fms_invoices_bl_number_idx' })
  blNumber?: string | null

  @Property({ name: 'container_numbers', type: 'jsonb', nullable: true })
  containerNumbers?: string[] | null

  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'voyage_number', type: 'text', nullable: true })
  voyageNumber?: string | null

  @Property({ name: 'custom_reference', type: 'text', nullable: true })
  customReference?: string | null

  @Property({ type: 'text', default: 'pending_review' })
  status: InvoiceStatus = 'pending_review'

  @Property({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null

  @Property({ name: 'reviewed_at', type: Date, nullable: true })
  reviewedAt?: Date | null

  @Property({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => FmsInvoiceLineItem, (li) => li.invoice)
  lineItems = new Collection<FmsInvoiceLineItem>(this)

  @OneToMany(() => FmsInvoicePage, (page) => page.invoice)
  pages = new Collection<FmsInvoicePage>(this)

  @OneToMany(() => FmsInvoiceCostAllocation, (a) => a.invoice)
  allocations = new Collection<FmsInvoiceCostAllocation>(this)
}

@Entity({ tableName: 'fms_invoice_line_items' })
@Index({
  name: 'fms_invoice_line_items_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_invoice_line_items_invoice_idx',
  properties: ['invoice'],
})
@Index({
  name: 'fms_invoice_line_items_product_idx',
  properties: ['product'],
})
export class FmsInvoiceLineItem {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'isExcluded' | 'isManuallyAdded'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsInvoice, { deleteRule: 'cascade' })
  invoice!: FmsInvoice

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

  @Property({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  netAmount: string = '0'

  @Property({ name: 'vat_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  vatAmount: string = '0'

  @Property({ name: 'gross_amount', type: 'numeric', precision: 18, scale: 2, default: '0' })
  grossAmount: string = '0'

  @ManyToOne(() => FmsProduct, {
    fieldName: 'product_id',
    deleteRule: 'set null',
    nullable: true,
  })
  product?: FmsProduct | null

  @Property({ name: 'charge_code_match_confidence', type: 'int', nullable: true })
  chargeCodeMatchConfidence?: number | null

  @Property({ name: 'raw_description', type: 'text', nullable: true })
  rawDescription?: string | null

  @Property({ name: 'is_excluded', type: 'boolean', default: false })
  isExcluded: boolean = false

  @Property({ name: 'is_manually_added', type: 'boolean', default: false })
  isManuallyAdded: boolean = false

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ========================================
// Cost Allocation Entity
// ========================================

@Entity({ tableName: 'fms_invoice_cost_allocations' })
@Index({
  name: 'fms_invoice_cost_alloc_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_invoice_cost_alloc_invoice_idx',
  properties: ['invoice'],
})
@Index({
  name: 'fms_invoice_cost_alloc_project_idx',
  properties: ['projectId'],
})
@Index({
  name: 'fms_invoice_cost_alloc_project_line_idx',
  properties: ['projectLineId'],
})
export class FmsInvoiceCostAllocation {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'currencyCode' | 'status'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsInvoice, { deleteRule: 'cascade' })
  invoice!: FmsInvoice

  @ManyToOne(() => FmsInvoiceLineItem, {
    fieldName: 'invoice_line_item_id',
    deleteRule: 'cascade',
  })
  invoiceLineItem!: FmsInvoiceLineItem

  @Property({ name: 'project_id', type: 'uuid' })
  projectId!: string

  @Property({ name: 'project_line_id', type: 'uuid' })
  projectLineId!: string

  @Property({ type: 'numeric', precision: 18, scale: 2, default: '0' })
  amount: string = '0'

  @Property({ name: 'currency_code', type: 'text', default: 'PLN' })
  currencyCode: string = 'PLN'

  @Property({ type: 'text', default: 'pending' })
  status: CostAllocationStatus = 'pending'

  @Property({ name: 'allocated_by', type: 'uuid', nullable: true })
  allocatedBy?: string | null

  @Property({ name: 'allocated_at', type: 'timestamptz', nullable: true })
  allocatedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'fms_invoice_pages' })
@Index({
  name: 'fms_invoice_pages_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_invoice_pages_invoice_idx',
  properties: ['invoice'],
})
export class FmsInvoicePage {
  [OptionalProps]?: 'createdAt' | 'storageDriver'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsInvoice, { deleteRule: 'cascade' })
  invoice!: FmsInvoice

  @Property({ name: 'page_number', type: 'int' })
  pageNumber!: number

  @Property({ name: 'storage_path', type: 'text' })
  storagePath!: string

  @Property({ name: 'storage_driver', type: 'text', default: 'local' })
  storageDriver: string = 'local'

  @Property({ type: 'int', nullable: true })
  width?: number | null

  @Property({ type: 'int', nullable: true })
  height?: number | null

  @Property({ name: 'file_size', type: 'int', nullable: true })
  fileSize?: number | null

  @Property({ name: 'extracted_text', type: 'text', nullable: true })
  extractedText?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
