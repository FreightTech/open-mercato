import { Migration } from '@mikro-orm/migrations';

export class Migration20260209155944 extends Migration {

  override async up(): Promise<void> {
    // Drop FK from products to charge_codes
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_charge_code_id_foreign";`);

    // Drop carriers unique constraint (entity change)
    this.addSql(`alter table "fms_carriers" drop constraint if exists "fms_carriers_code_unique";`);

    // Drop old charge_code_id column and index from products
    this.addSql(`drop index if exists "fms_products_charge_code_idx";`);
    this.addSql(`alter table "fms_products" drop column if exists "charge_code_id";`);

    // Add new flat fields to products
    this.addSql(`alter table "fms_products" add column if not exists "charge_code" text null, add column if not exists "charge_unit" text null, add column if not exists "transport_mode" text null;`);
    this.addSql(`create index if not exists "fms_products_charge_code_idx" on "fms_products" ("organization_id", "tenant_id", "charge_code");`);

    // Drop the fms_charge_codes table
    this.addSql(`drop table if exists "fms_charge_codes" cascade;`);
  }

  override async down(): Promise<void> {
    // Recreate fms_charge_codes table
    this.addSql(`create table "fms_charge_codes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text null, "description" text null, "charge_unit" text not null, "keywords" text null, "usage" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_charge_codes_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_charge_codes_scope_idx" on "fms_charge_codes" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_charge_codes" add constraint "fms_charge_codes_code_unique" unique ("organization_id", "tenant_id", "code");`);

    // Restore carriers unique constraint
    this.addSql(`alter table "fms_carriers" add constraint "fms_carriers_code_unique" unique ("organization_id", "tenant_id", "code");`);

    // Remove new columns and restore old FK column
    this.addSql(`drop index "fms_products_charge_code_idx";`);
    this.addSql(`alter table "fms_products" drop column "charge_code", drop column "charge_unit", drop column "transport_mode";`);

    this.addSql(`alter table "fms_products" add column "charge_code_id" uuid null;`);
    this.addSql(`alter table "fms_products" add constraint "fms_products_charge_code_id_foreign" foreign key ("charge_code_id") references "fms_charge_codes" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "fms_products_charge_code_idx" on "fms_products" ("charge_code_id");`);
  }

}
