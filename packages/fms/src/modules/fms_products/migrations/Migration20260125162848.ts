import { Migration } from '@mikro-orm/migrations';

export class Migration20260125162848 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fms_carriers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "carrier_type" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_carriers_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fms_carriers_scope_idx" on "fms_carriers" ("organization_id", "tenant_id");`);
    this.addSql(`
      do $$ begin
        alter table "fms_carriers" add constraint "fms_carriers_code_unique" unique ("organization_id", "tenant_id", "code");
      exception when others then null; end $$;
    `);

    this.addSql(`create table if not exists "fms_price_types" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "description" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_price_types_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fms_price_types_scope_idx" on "fms_price_types" ("organization_id", "tenant_id");`);
    this.addSql(`
      do $$ begin
        alter table "fms_price_types" add constraint "fms_price_types_code_unique" unique ("organization_id", "tenant_id", "code");
      exception when others then null; end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_products') then
          alter table "fms_products" drop constraint if exists "fms_products_service_provider_id_foreign";
        end if;
      end $$;
    `);

    // Note: charge_codes columns (name, keywords, usage) were already added by Migration20260124225500

    this.addSql(`drop index if exists "fms_products_contractor_idx";`);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'service_provider_id') then
          alter table "fms_products" rename column "service_provider_id" to "carrier_id";
        end if;
      end $$;
    `);
    // Clear existing values since they referenced contractors, not carriers
    this.addSql(`update "fms_products" set "carrier_id" = null;`);
    this.addSql(`
      do $$ begin
        alter table "fms_products" add constraint "fms_products_carrier_id_foreign" foreign key ("carrier_id") references "fms_carriers" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
    this.addSql(`create index if not exists "fms_products_carrier_idx" on "fms_products" ("carrier_id");`);

    this.addSql(`drop index if exists "fms_product_variants_variant_type_index";`);
    this.addSql(`alter table "fms_product_variants" drop column if exists "variant_type", drop column if exists "name", drop column if exists "is_default", drop column if exists "container_type", drop column if exists "weight_limit", drop column if exists "weight_unit";`);

    this.addSql(`alter table "fms_product_variants" add column if not exists "price_type_id" uuid null, add column if not exists "validity_start" date null, add column if not exists "validity_end" date null, add column if not exists "price" numeric(18,2) null, add column if not exists "currency_code" text not null default 'USD', add column if not exists "reference" text null;`);
    this.addSql(`
      do $$ begin
        alter table "fms_product_variants" add constraint "fms_product_variants_price_type_id_foreign" foreign key ("price_type_id") references "fms_price_types" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
    this.addSql(`create index if not exists "fms_product_variants_active_validity_idx" on "fms_product_variants" ("product_id", "is_active", "validity_start", "validity_end");`);
    this.addSql(`create index if not exists "fms_product_variants_validity_idx" on "fms_product_variants" ("validity_start", "validity_end");`);
    this.addSql(`create index if not exists "fms_product_variants_provider_idx" on "fms_product_variants" ("provider_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_products') then
          alter table "fms_products" drop constraint if exists "fms_products_carrier_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_product_variants') then
          alter table "fms_product_variants" drop constraint if exists "fms_product_variants_price_type_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`create table if not exists "fms_product_prices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "variant_id" uuid not null, "validity_start" date not null, "validity_end" date null, "contract_type" text not null, "contract_number" text null, "price" numeric(18,2) not null, "currency_code" text not null default 'USD', "is_active" boolean not null default true, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_product_prices_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fms_product_prices_active_idx" on "fms_product_prices" ("variant_id", "is_active", "validity_start", "validity_end");`);
    this.addSql(`create index if not exists "fms_product_prices_contract_idx" on "fms_product_prices" ("contract_type", "contract_number");`);
    this.addSql(`create index if not exists "fms_product_prices_validity_idx" on "fms_product_prices" ("variant_id", "validity_start", "validity_end");`);
    this.addSql(`create index if not exists "fms_product_prices_variant_idx" on "fms_product_prices" ("variant_id");`);
    this.addSql(`create index if not exists "fms_product_prices_scope_idx" on "fms_product_prices" ("organization_id", "tenant_id");`);

    this.addSql(`
      do $$ begin
        alter table "fms_product_prices" add constraint "fms_product_prices_variant_id_foreign" foreign key ("variant_id") references "fms_product_variants" ("id") on update cascade on delete cascade;
      exception when others then null; end $$;
    `);

    // Note: charge_codes columns are not reverted here - they were added by Migration20260124225500

    this.addSql(`drop index if exists "fms_products_carrier_idx";`);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_products' and column_name = 'carrier_id') then
          alter table "fms_products" rename column "carrier_id" to "service_provider_id";
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_products" add constraint "fms_products_service_provider_id_foreign" foreign key ("service_provider_id") references "contractors" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
    this.addSql(`create index if not exists "fms_products_contractor_idx" on "fms_products" ("service_provider_id");`);

    this.addSql(`drop index if exists "fms_product_variants_active_validity_idx";`);
    this.addSql(`drop index if exists "fms_product_variants_validity_idx";`);
    this.addSql(`drop index if exists "fms_product_variants_provider_idx";`);
    this.addSql(`alter table "fms_product_variants" drop column if exists "price_type_id", drop column if exists "validity_start", drop column if exists "validity_end", drop column if exists "price", drop column if exists "currency_code";`);

    this.addSql(`alter table "fms_product_variants" add column if not exists "variant_type" text not null, add column if not exists "is_default" boolean not null default false, add column if not exists "container_type" text null, add column if not exists "weight_limit" numeric(10,0) null, add column if not exists "weight_unit" text null;`);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_product_variants' and column_name = 'reference') then
          alter table "fms_product_variants" rename column "reference" to "name";
        end if;
      end $$;
    `);
    this.addSql(`create index if not exists "fms_product_variants_variant_type_index" on "fms_product_variants" ("variant_type");`);
  }

}
