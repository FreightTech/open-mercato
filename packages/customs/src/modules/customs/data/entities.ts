import { Collection } from '@mikro-orm/core'
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Index } from '@mikro-orm/decorators/legacy'

// ── Shared interfaces (used in JSON columns) ────────────────────────

export interface ProductLine {
  lineNumber: number
  description: string
  model?: string
  vinOrSerial?: string
  engineNumber?: string
  countryOfOrigin?: string
  containerNumber?: string
  quantity: number
  unit: string
  unitPrice?: number
  totalValue?: number
  currency?: string
  netWeightKg?: number
  grossWeightKg?: number
  measurementCbm?: number
  hsCodeFromInvoice?: string
  incoterms?: string
}

export interface NormalizedDocument {
  documentNumber?: string
  documentDate?: string
  invoiceReference?: string
  shipperName?: string
  shipperAddress?: string
  consigneeName?: string
  consigneeAddress?: string
  buyerName?: string
  buyerAddress?: string
  notifyParty?: string
  carrierName?: string
  vessel?: string
  voyageNumber?: string
  loadingPort?: string
  dischargePort?: string
  placeOfReceipt?: string
  placeOfDelivery?: string
  containerNumbers?: string[]
  sealNumbers?: string[]
  totalGrossWeightKg?: number
  totalNetWeightKg?: number
  totalPackages?: number
  totalVolumeCbm?: number
  totalValue?: number
  currency?: string
  incoterms?: string
  freightTerms?: string
  contractReference?: string
  paymentTerms?: string
  shippedOnBoard?: string
  productLines?: ProductLine[]
}

export interface HsSuggestion {
  hsCode: string
  description: string
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
  source?: 'ai' | 'manual'
}

export interface NonTariffMeasureDetail {
  description: string
  countryCode?: string
  countryDescription?: string
  conditions?: { code: string; description: string; action: string }[]
  certificates?: { code: string; description: string }[]
  regulationAbbreviation?: string
  regulationLink?: string
}

export interface Isztar4EnrichedResult {
  code: string
  description: string
  dutyAmount?: string
  supplementaryUnit?: string
  nonTariffMeasures?: (NonTariffMeasureDetail | string)[]
  valid: boolean
}

// ── Tariff Tree interfaces (for grounded HS classification) ─────────

export interface TariffTreeNode {
  code?: string
  description: string
  children?: TariffTreeNode[]
}

export interface TariffTreePath {
  chapterCode: string
  chapterDescription: string
  headingCode: string
  headingDescription: string
  leafCode: string
  leafDescription: string
  reasoning: string
  alternativeHeadings?: { code: string; description: string; note: string }[]
}

export type ShipmentStatus = 'uploading' | 'parsing' | 'ready' | 'error'
export type DocumentType = 'bill_of_lading' | 'commercial_invoice' | 'packing_list'
export type CheckStatus = 'ok' | 'mismatch' | 'missing' | 'warning'

// ── Entity: CustomsShipment ─────────────────────────────────────────

@Entity({ tableName: 'customs_shipments' })
@Index({ name: 'idx_customs_shipments_tenant_org', properties: ['tenantId', 'organizationId'] })
export class CustomsShipment {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'text', default: 'uploading' })
  status: ShipmentStatus = 'uploading'

  @Property({ name: 'bl_number', type: 'text', nullable: true })
  blNumber?: string | null

  @Property({ name: 'invoice_number', type: 'text', nullable: true })
  invoiceNumber?: string | null

  @Property({ name: 'shipper_name', type: 'text', nullable: true })
  shipperName?: string | null

  @Property({ name: 'consignee_name', type: 'text', nullable: true })
  consigneeName?: string | null

  @Property({ name: 'loading_port', type: 'text', nullable: true })
  loadingPort?: string | null

  @Property({ name: 'discharge_port', type: 'text', nullable: true })
  dischargePort?: string | null

  @Property({ type: 'text', nullable: true })
  vessel?: string | null

  @Property({ name: 'shipped_on_board', type: 'text', nullable: true })
  shippedOnBoard?: string | null

  @Property({ name: 'product_lines', type: 'jsonb', nullable: true })
  productLines?: ProductLine[] | null

  @OneToMany(() => ParsedDocument, (d) => d.shipment)
  documents = new Collection<ParsedDocument>(this)

  @OneToMany(() => ConsistencyCheck, (c) => c.shipment)
  consistencyChecks = new Collection<ConsistencyCheck>(this)

  @OneToMany(() => HsClassification, (h) => h.shipment)
  hsClassifications = new Collection<HsClassification>(this)

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ── Entity: ParsedDocument ──────────────────────────────────────────

@Entity({ tableName: 'customs_parsed_documents' })
@Index({ name: 'idx_customs_parsed_docs_shipment', properties: ['shipment'] })
export class ParsedDocument {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => CustomsShipment, { name: 'shipment_id' })
  shipment!: CustomsShipment

  @Property({ name: 'document_type', type: 'text' })
  documentType!: DocumentType

  @Property({ name: 'file_name', type: 'text' })
  fileName!: string

  @Property({ name: 'file_data', type: 'text', lazy: true })
  fileData!: string

  @Property({ type: 'jsonb', nullable: true })
  extracted?: NormalizedDocument | null

  @Property({ name: 'parse_error', type: 'text', nullable: true })
  parseError?: string | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

// ── Entity: ConsistencyCheck ────────────────────────────────────────

@Entity({ tableName: 'customs_consistency_checks' })
@Index({ name: 'idx_customs_consistency_shipment', properties: ['shipment'] })
export class ConsistencyCheck {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => CustomsShipment, { name: 'shipment_id' })
  shipment!: CustomsShipment

  @Property({ type: 'text' })
  field!: string

  @Property({ type: 'text' })
  label!: string

  @Property({ name: 'source_doc1', type: 'text' })
  sourceDoc1!: string

  @Property({ name: 'source_doc2', type: 'text' })
  sourceDoc2!: string

  @Property({ type: 'jsonb', nullable: true })
  value1?: unknown

  @Property({ type: 'jsonb', nullable: true })
  value2?: unknown

  @Property({ type: 'text' })
  status!: CheckStatus

  @Property({ type: 'text', nullable: true })
  discrepancy?: string | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

// ── Entity: HsClassification ────────────────────────────────────────

@Entity({ tableName: 'customs_hs_classifications' })
@Index({ name: 'idx_customs_hs_class_shipment', properties: ['shipment'] })
export class HsClassification {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => CustomsShipment, { name: 'shipment_id' })
  shipment!: CustomsShipment

  @Property({ name: 'line_number', type: 'int' })
  lineNumber!: number

  @Property({ name: 'product_description', type: 'text' })
  productDescription!: string

  @Property({ name: 'ai_suggestions', type: 'jsonb' })
  aiSuggestions!: HsSuggestion[]

  @Property({ name: 'isztar4_results', type: 'jsonb', nullable: true })
  isztar4Results?: Isztar4EnrichedResult[] | null

  @Property({ name: 'tariff_tree', type: 'jsonb', nullable: true })
  tariffTree?: TariffTreeNode | null

  @Property({ name: 'ai_path', type: 'jsonb', nullable: true })
  aiPath?: TariffTreePath | null

  @Property({ name: 'selected_hs_code', type: 'text', nullable: true })
  selectedHsCode?: string | null

  @Property({ name: 'selected_description', type: 'text', nullable: true })
  selectedDescription?: string | null

  @Property({ name: 'selected_duty_rate', type: 'text', nullable: true })
  selectedDutyRate?: string | null

  @Property({ name: 'selected_at', type: Date, nullable: true })
  selectedAt?: Date | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
