import { Migration } from '@mikro-orm/migrations';

export class Migration20260325100000 extends Migration {

  override async up(): Promise<void> {
    // Add offer_id and rfq_id to fms_files
    this.addSql(`alter table "fms_files" add column "offer_id" uuid null;`);
    this.addSql(`alter table "fms_files" add column "rfq_id" uuid null;`);

    // Create fms_file_lines table
    this.addSql(`
      create table "fms_file_lines" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "file_id" uuid not null,
        "line_number" int not null default 0,
        "source_offer_line_id" uuid null,
        "source_type" text not null default 'manual',
        "product_id" uuid null,
        "price_id" uuid null,
        "product_name" text not null,
        "charge_code" text null,
        "charge_category" text null,
        "charge_unit" text null,
        "container_type" text null,
        "container_size" text null,
        "quantity" numeric(18, 4) not null default '1',
        "currency_code" text not null default 'USD',
        "sold_unit_price" numeric(18, 4) not null default '0',
        "sold_amount" numeric(18, 4) not null default '0',
        "estimated_unit_cost" numeric(18, 4) null,
        "estimated_cost" numeric(18, 4) null,
        "actual_unit_cost" numeric(18, 4) null,
        "actual_cost" numeric(18, 4) null,
        "actual_sell_unit_price" numeric(18, 4) null,
        "actual_sell_amount" numeric(18, 4) null,
        "notes" text null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "deleted_at" timestamptz null,
        constraint "fms_file_lines_pkey" primary key ("id")
      );
    `);

    this.addSql(`create index "fms_file_lines_org_tenant_idx" on "fms_file_lines" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_file_lines_file_idx" on "fms_file_lines" ("file_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "fms_file_lines_file_idx";`);
    this.addSql(`drop index "fms_file_lines_org_tenant_idx";`);
    this.addSql(`drop table if exists "fms_file_lines";`);

    this.addSql(`alter table "fms_files" drop column "offer_id";`);
    this.addSql(`alter table "fms_files" drop column "rfq_id";`);
  }

}
