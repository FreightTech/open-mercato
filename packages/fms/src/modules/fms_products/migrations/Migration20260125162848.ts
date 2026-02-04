import { Migration } from '@mikro-orm/migrations';

export class Migration20260125162848 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_carriers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "carrier_type" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_carriers_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_carriers_scope_idx" on "fms_carriers" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_carriers" add constraint "fms_carriers_code_unique" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "fms_price_types" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "description" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_price_types_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_price_types_scope_idx" on "fms_price_types" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_price_types" add constraint "fms_price_types_code_unique" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`alter table "fms_products" drop constraint "fms_products_service_provider_id_foreign";`);

    // Note: charge_codes columns (name, keywords, usage) were already added by Migration20260124225500

    this.addSql(`drop index "fms_products_contractor_idx";`);

    this.addSql(`alter table "fms_products" rename column "service_provider_id" to "carrier_id";`);
    // Clear existing values since they referenced contractors, not carriers
    this.addSql(`update "fms_products" set "carrier_id" = null;`);
    this.addSql(`alter table "fms_products" add constraint "fms_products_carrier_id_foreign" foreign key ("carrier_id") references "fms_carriers" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "fms_products_carrier_idx" on "fms_products" ("carrier_id");`);

    this.addSql(`drop index "fms_product_variants_variant_type_index";`);
    this.addSql(`alter table "fms_product_variants" drop column "variant_type", drop column "name", drop column "is_default", drop column "container_type", drop column "weight_limit", drop column "weight_unit";`);

    this.addSql(`alter table "fms_product_variants" add column "price_type_id" uuid null, add column "validity_start" date null, add column "validity_end" date null, add column "price" numeric(18,2) null, add column "currency_code" text not null default 'USD', add column "reference" text null;`);
    this.addSql(`alter table "fms_product_variants" add constraint "fms_product_variants_price_type_id_foreign" foreign key ("price_type_id") references "fms_price_types" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "fms_product_variants_active_validity_idx" on "fms_product_variants" ("product_id", "is_active", "validity_start", "validity_end");`);
    this.addSql(`create index "fms_product_variants_validity_idx" on "fms_product_variants" ("validity_start", "validity_end");`);
    this.addSql(`create index "fms_product_variants_provider_idx" on "fms_product_variants" ("provider_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_products" drop constraint "fms_products_carrier_id_foreign";`);

    this.addSql(`alter table "fms_product_variants" drop constraint "fms_product_variants_price_type_id_foreign";`);

    this.addSql(`create table "fms_product_prices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "variant_id" uuid not null, "validity_start" date not null, "validity_end" date null, "contract_type" text not null, "contract_number" text null, "price" numeric(18,2) not null, "currency_code" text not null default 'USD', "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_product_prices_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_product_prices_active_idx" on "fms_product_prices" ("variant_id", "is_active", "validity_start", "validity_end");`);
    this.addSql(`create index "fms_product_prices_contract_idx" on "fms_product_prices" ("contract_type", "contract_number");`);
    this.addSql(`create index "fms_product_prices_validity_idx" on "fms_product_prices" ("variant_id", "validity_start", "validity_end");`);
    this.addSql(`create index "fms_product_prices_variant_idx" on "fms_product_prices" ("variant_id");`);
    this.addSql(`create index "fms_product_prices_scope_idx" on "fms_product_prices" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "fms_product_prices" add constraint "fms_product_prices_variant_id_foreign" foreign key ("variant_id") references "fms_product_variants" ("id") on update cascade on delete cascade;`);

    // Note: charge_codes columns are not reverted here - they were added by Migration20260124225500

    this.addSql(`drop index "fms_products_carrier_idx";`);

    this.addSql(`alter table "fms_products" rename column "carrier_id" to "service_provider_id";`);
    this.addSql(`alter table "fms_products" add constraint "fms_products_service_provider_id_foreign" foreign key ("service_provider_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "fms_products_contractor_idx" on "fms_products" ("service_provider_id");`);

    this.addSql(`drop index "fms_product_variants_active_validity_idx";`);
    this.addSql(`drop index "fms_product_variants_validity_idx";`);
    this.addSql(`drop index "fms_product_variants_provider_idx";`);
    this.addSql(`alter table "fms_product_variants" drop column "price_type_id", drop column "validity_start", drop column "validity_end", drop column "price", drop column "currency_code";`);

    this.addSql(`alter table "fms_product_variants" add column "variant_type" text not null, add column "is_default" boolean not null default false, add column "container_type" text null, add column "weight_limit" numeric(10,0) null, add column "weight_unit" text null;`);
    this.addSql(`alter table "fms_product_variants" rename column "reference" to "name";`);
    this.addSql(`create index "fms_product_variants_variant_type_index" on "fms_product_variants" ("variant_type");`);
  }

}
