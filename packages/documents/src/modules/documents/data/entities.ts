import { Collection, OptionalProps } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OneToMany, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import type { DocumentType, TransportationMetadata } from './schema-types'
import type { ProcessingStatus, ConsensusRecommendation } from '../services/pipeline/types'

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

@Entity({ tableName: 'documents' })
@Index({ name: 'documents_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'documents_category_idx', properties: ['category'] })
@Index({ name: 'documents_attachment_idx', properties: ['attachmentId'] })
@Index({
  name: 'documents_related_entity_idx',
  properties: ['relatedEntityId', 'relatedEntityType'],
})
export class Document {
  [OptionalProps]?:
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
    | 'processingStatus'
    | 'retryCount'
    | 'children'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToMany(() => DocumentPage, (page) => page.document)
  pages = new Collection<DocumentPage>(this)

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

  @Property({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number = 0

  @Property({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null

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
  @Index({ name: 'documents_bl_number_idx' })
  blNumber?: string | null

  @Property({ name: 'mbl_number', type: 'text', nullable: true })
  @Index({ name: 'documents_mbl_number_idx' })
  mblNumber?: string | null

  @Property({ name: 'booking_number', type: 'text', nullable: true })
  @Index({ name: 'documents_booking_number_idx' })
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

  @ManyToOne(() => Document, {
    fieldName: 'parent_document_id',
    deleteRule: 'set null',
    nullable: true,
  })
  @Index({ name: 'documents_parent_idx' })
  parentDocument?: Document | null

  @OneToMany(() => Document, (doc) => doc.parentDocument)
  children = new Collection<Document>(this)

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

@Entity({ tableName: 'document_pages' })
@Index({
  name: 'document_pages_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'document_pages_document_idx',
  properties: ['document'],
})
export class DocumentPage {
  [OptionalProps]?: 'createdAt' | 'storageDriver'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => Document, { deleteRule: 'cascade' })
  document!: Document

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
