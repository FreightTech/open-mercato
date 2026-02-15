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
import type { InvoiceStatus, ExtractionConfidence } from './invoice-types'
import type { DocumentType, TransportationMetadata } from './schema-types'
import type { ProcessingStatus, ConsensusRecommendation } from '../services/pipeline/types'
import { FmsProduct } from '../../fms_products/data/entities'

export enum DocumentCategory {
  OFFER = 'offer',
  INVOICE = 'invoice',
  CUSTOMS = 'customs',
  BILL_OF_LADING = 'bill_of_lading',
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

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

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
  [OptionalProps]?: 'createdAt' | 'updatedAt'

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
