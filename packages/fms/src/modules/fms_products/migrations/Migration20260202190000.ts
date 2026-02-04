import { Migration } from '@mikro-orm/migrations';

export class Migration20260202190000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop table if exists "fms_price_types";`);
  }

  override async down(): Promise<void> {
    this.addSql(`create table if not exists "fms_price_types" ("id" uuid not null default uuid_generate_v4(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "description" text null, "is_active" boolean not null default true, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "created_by" uuid null, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_price_types_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fms_price_types_scope_idx" on "fms_price_types" ("organization_id", "tenant_id");`);
    this.addSql(`create unique index if not exists "fms_price_types_code_unique" on "fms_price_types" ("organization_id", "tenant_id", "code") where deleted_at is null;`);
  }

}
