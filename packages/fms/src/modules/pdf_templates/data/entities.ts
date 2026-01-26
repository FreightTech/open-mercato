import {
  Entity,
  Index,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'

export type PdfTemplateType = 'offer'

export type PageSize = 'A4' | 'A3' | 'Letter' | 'Legal'
export type PageOrientation = 'portrait' | 'landscape'

@Entity({ tableName: 'fms_pdf_templates' })
@Index({ name: 'fms_pdf_templates_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'fms_pdf_templates_scope_type_unique',
  properties: ['organizationId', 'tenantId', 'templateType'],
})
export class PdfTemplate {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'pageSize' | 'pageOrientation' | 'isActive'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'template_type', type: 'text' })
  templateType!: PdfTemplateType

  @Property({ name: 'html_template', type: 'text' })
  htmlTemplate!: string

  @Property({ name: 'css_styles', type: 'text', nullable: true })
  cssStyles?: string | null

  @Property({ name: 'page_size', type: 'text', default: 'A4' })
  pageSize: PageSize = 'A4'

  @Property({ name: 'page_orientation', type: 'text', default: 'portrait' })
  pageOrientation: PageOrientation = 'portrait'

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'fms_pdf_settings' })
@Unique({
  name: 'fms_pdf_settings_scope_unique',
  properties: ['organizationId', 'tenantId'],
})
export class PdfSettings {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'primaryColor' | 'accentColor'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // Branding
  @Property({ name: 'company_name', type: 'text', nullable: true })
  companyName?: string | null

  @Property({ name: 'company_logo_url', type: 'text', nullable: true })
  companyLogoUrl?: string | null

  @Property({ name: 'primary_color', type: 'text', default: '#1a365d' })
  primaryColor: string = '#1a365d'

  @Property({ name: 'accent_color', type: 'text', default: '#f7fafc' })
  accentColor: string = '#f7fafc'

  // Custom header/footer HTML
  @Property({ name: 'header_html', type: 'text', nullable: true })
  headerHtml?: string | null

  @Property({ name: 'footer_html', type: 'text', nullable: true })
  footerHtml?: string | null

  // Cover page and terms
  @Property({ name: 'cover_page_image_url', type: 'text', nullable: true })
  coverPageImageUrl?: string | null

  @Property({ name: 'rules_agreement_html', type: 'text', nullable: true })
  rulesAgreementHtml?: string | null

  // Additional settings
  @Property({ name: 'show_page_numbers', type: 'boolean', default: true })
  showPageNumbers: boolean = true

  @Property({ name: 'default_page_size', type: 'text', default: 'A4' })
  defaultPageSize: PageSize = 'A4'

  @Property({ name: 'default_page_orientation', type: 'text', default: 'portrait' })
  defaultPageOrientation: PageOrientation = 'portrait'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
