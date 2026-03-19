import {
  Entity,
  Index,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'

export type PdfTemplateType = 'offer'

/**
 * Pdfme template JSON structure.
 * This is compatible with @pdfme/common Template type.
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
 * Pdfme-based visual template entity.
 * Stores template JSON for use with @pdfme/generator.
 */
@Entity({ tableName: 'fms_pdfme_templates' })
@Index({ name: 'fms_pdfme_templates_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'fms_pdfme_templates_scope_type_unique',
  properties: ['organizationId', 'tenantId', 'templateType'],
})
export class PdfmeTemplate {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'isActive' | 'deletedAt' | 'previewImageUrl' | 'description'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'template_type', type: 'text' })
  templateType!: PdfTemplateType

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  /**
   * The pdfme Template JSON object.
   * Contains basePdf and schemas arrays for visual PDF generation.
   */
  @Property({ name: 'template_json', type: 'jsonb' })
  templateJson!: PdfmeTemplateJson

  /**
   * Preview thumbnail URL for template listing.
   */
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
