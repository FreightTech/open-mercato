import { Migration } from '@mikro-orm/migrations';

export class Migration20260120124929 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fms_email_settings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "company_name" text null, "company_logo_url" text null, "primary_color" text not null default '#1a365d', "accent_color" text not null default '#f7fafc', "contact_email" text null, "contact_phone" text null, "website_url" text null, "footer_text" text null, "footer_disclaimer" text null, "from_name" text null, "from_email" text null, "reply_to_email" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "fms_email_settings_pkey" primary key ("id"));`);
    this.addSql(`
      do $$ begin
        alter table "fms_email_settings" add constraint "fms_email_settings_scope_unique" unique ("organization_id", "tenant_id");
      exception when others then null; end $$;
    `);

    this.addSql(`create table if not exists "fms_email_templates" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "template_type" text not null, "subject_template" text not null, "html_template" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "fms_email_templates_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fms_email_templates_org_tenant_idx" on "fms_email_templates" ("organization_id", "tenant_id");`);
    this.addSql(`
      do $$ begin
        alter table "fms_email_templates" add constraint "fms_email_templates_scope_type_unique" unique ("organization_id", "tenant_id", "template_type");
      exception when others then null; end $$;
    `);
  }
}
