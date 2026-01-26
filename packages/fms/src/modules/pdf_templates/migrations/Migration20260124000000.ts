import { Migration } from '@mikro-orm/migrations'

export class Migration20260124000000 extends Migration {
  override async up(): Promise<void> {
    // Create PDF settings table
    this.addSql(`
      create table "fms_pdf_settings" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "company_name" text null,
        "company_logo_url" text null,
        "primary_color" text not null default '#1a365d',
        "accent_color" text not null default '#f7fafc',
        "header_html" text null,
        "footer_html" text null,
        "show_page_numbers" boolean not null default true,
        "default_page_size" text not null default 'A4',
        "default_page_orientation" text not null default 'portrait',
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "fms_pdf_settings_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      alter table "fms_pdf_settings" 
      add constraint "fms_pdf_settings_scope_unique" 
      unique ("organization_id", "tenant_id");
    `)

    // Create PDF templates table
    this.addSql(`
      create table "fms_pdf_templates" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "template_type" text not null,
        "html_template" text not null,
        "css_styles" text null,
        "page_size" text not null default 'A4',
        "page_orientation" text not null default 'portrait',
        "is_active" boolean not null default true,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "fms_pdf_templates_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index "fms_pdf_templates_org_tenant_idx" 
      on "fms_pdf_templates" ("organization_id", "tenant_id");
    `)
    this.addSql(`
      alter table "fms_pdf_templates" 
      add constraint "fms_pdf_templates_scope_type_unique" 
      unique ("organization_id", "tenant_id", "template_type");
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fms_pdf_templates";`)
    this.addSql(`drop table if exists "fms_pdf_settings";`)
  }
}
