import {
  Entity,
  Index,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'

/**
 * Pdfme template JSON structure.
 * Compatible with @pdfme/common Template type.
 */
export interface PdfmeTemplateJson {
  basePdf: string | {
    width: number
    height: number
    padding: [number, number, number, number]
  }
  schemas: Array<Array<{
    name: string
    type: string
    position: { x: number; y: number }
    width: number
    height: number
    content?: string
    [key: string]: unknown
  }>>
}

/**
 * Generic document template entity.
 * Stores pdfme template JSON for PDF generation.
 * Any module can register its own template types (e.g. 'offer', 'invoice', 'ksef_invoice').
 */
@Entity({ tableName: 'document_templates' })
@Index({ name: 'document_templates_scope_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'document_templates_scope_type_unique',
  properties: ['organizationId', 'tenantId', 'templateType'],
})
export class DocumentTemplate {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'isActive' | 'deletedAt' | 'previewImageUrl' | 'description'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'template_type', type: 'text' })
  templateType!: string

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'template_json', type: 'jsonb' })
  templateJson!: PdfmeTemplateJson

  @Property({ name: 'preview_image_url', type: 'text', nullable: true })
  previewImageUrl?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
