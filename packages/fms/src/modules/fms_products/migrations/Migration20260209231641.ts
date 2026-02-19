import { Migration } from '@mikro-orm/migrations';

export class Migration20260209231641 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_carriers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "carrier_type" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_carriers_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_carriers_scope_idx" on "fms_carriers" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_products" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "charge_code" text null, "charge_unit" text null, "transport_mode" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_products_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_products_active_idx" on "fms_products" ("organization_id", "tenant_id", "is_active");`);
    this.addSql(`create index "fms_products_charge_code_idx" on "fms_products" ("organization_id", "tenant_id", "charge_code");`);
    this.addSql(`create index "fms_products_scope_idx" on "fms_products" ("organization_id", "tenant_id");`);

    this.addSql(`do $$ begin if exists (select 1 from information_schema.tables where table_name = 'fms_invoice_line_items') then alter table "fms_invoice_line_items" add constraint "fms_invoice_line_items_product_id_foreign" foreign key ("product_id") references "fms_products" ("id") on update cascade on delete set null; end if; exception when duplicate_object then null; end $$;`);
  }

}
