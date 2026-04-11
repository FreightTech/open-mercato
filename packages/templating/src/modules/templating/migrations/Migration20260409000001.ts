import { Migration } from '@mikro-orm/migrations'

export class Migration20260409000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "document_templates" (
      "id" uuid not null default gen_random_uuid(),
      "organization_id" uuid not null,
      "tenant_id" uuid not null,
      "template_type" text not null,
      "name" text not null,
      "description" text null,
      "template_json" jsonb not null,
      "preview_image_url" text null,
      "is_active" boolean not null default true,
      "deleted_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "document_templates_pkey" primary key ("id")
    );`)
    this.addSql(`create index "document_templates_scope_idx" on "document_templates" ("organization_id", "tenant_id");`)
    this.addSql(`alter table "document_templates" add constraint "document_templates_scope_type_unique" unique ("organization_id", "tenant_id", "template_type");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "document_templates" cascade;`)
  }
}

export default Migration20260409000001
