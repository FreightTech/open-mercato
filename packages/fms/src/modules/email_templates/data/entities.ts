import {
  Entity,
  Index,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'

export type EmailTemplateType =
  | 'offer'
  | 'invoice'
  | 'quote_request'
  | 'shipment_notification'
  | 'booking_confirmation'
  | 'general_message'

@Entity({ tableName: 'fms_email_templates' })
@Index({ name: 'fms_email_templates_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'fms_email_templates_scope_type_unique',
  properties: ['organizationId', 'tenantId', 'templateType'],
})
export class EmailTemplate {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'template_type', type: 'text' })
  templateType!: EmailTemplateType

  @Property({ name: 'subject_template', type: 'text' })
  subjectTemplate!: string

  @Property({ name: 'html_template', type: 'text' })
  htmlTemplate!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'fms_email_settings' })
@Unique({
  name: 'fms_email_settings_scope_unique',
  properties: ['organizationId', 'tenantId'],
})
export class EmailSettings {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // Email branding
  @Property({ name: 'company_name', type: 'text', nullable: true })
  companyName?: string | null

  @Property({ name: 'company_logo_url', type: 'text', nullable: true })
  companyLogoUrl?: string | null

  @Property({ name: 'primary_color', type: 'text', default: '#1a365d' })
  primaryColor: string = '#1a365d'

  @Property({ name: 'accent_color', type: 'text', default: '#f7fafc' })
  accentColor: string = '#f7fafc'

  // Contact information
  @Property({ name: 'contact_email', type: 'text', nullable: true })
  contactEmail?: string | null

  @Property({ name: 'contact_phone', type: 'text', nullable: true })
  contactPhone?: string | null

  @Property({ name: 'website_url', type: 'text', nullable: true })
  websiteUrl?: string | null

  // Footer content
  @Property({ name: 'footer_text', type: 'text', nullable: true })
  footerText?: string | null

  @Property({ name: 'footer_disclaimer', type: 'text', nullable: true })
  footerDisclaimer?: string | null

  // Default sender
  @Property({ name: 'from_name', type: 'text', nullable: true })
  fromName?: string | null

  @Property({ name: 'from_email', type: 'text', nullable: true })
  fromEmail?: string | null

  @Property({ name: 'reply_to_email', type: 'text', nullable: true })
  replyToEmail?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
