import { Migration } from '@mikro-orm/migrations';

export class Migration20260212214856 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "table_definitions" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "site_id" text not null, "drive_id" text not null, "item_id" text not null, "file_path" text null, "worksheet_name" text not null, "data_range" text null, "column_config" jsonb null, "has_header_row" boolean not null default true, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "table_definitions_pkey" primary key ("id"));`);
    this.addSql(`create index "table_definitions_org_tenant_idx" on "table_definitions" ("organization_id", "tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "table_definitions";`);
  }

}
