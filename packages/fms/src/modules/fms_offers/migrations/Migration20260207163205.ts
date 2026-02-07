import { Migration } from '@mikro-orm/migrations';

export class Migration20260207163205 extends Migration {

  override async up(): Promise<void> {
    // Drop quote-related foreign key constraints before dropping tables
    this.addSql(`alter table "fms_quotes" drop constraint if exists "fms_quotes_client_id_foreign";`);
    this.addSql(`alter table "fms_quote_origin_ports" drop constraint if exists "fms_quote_origin_ports_quote_id_foreign";`);
    this.addSql(`alter table "fms_quote_origin_ports" drop constraint if exists "fms_quote_origin_ports_location_id_foreign";`);
    this.addSql(`alter table "fms_quote_destination_ports" drop constraint if exists "fms_quote_destination_ports_quote_id_foreign";`);
    this.addSql(`alter table "fms_quote_destination_ports" drop constraint if exists "fms_quote_destination_ports_location_id_foreign";`);
    this.addSql(`alter table "fms_quote_lines" drop constraint if exists "fms_quote_lines_quote_id_foreign";`);
    this.addSql(`alter table "fms_offers" drop constraint if exists "fms_offers_quote_id_foreign";`);
    this.addSql(`alter table "fms_offer_lines" drop constraint if exists "fms_offer_lines_offer_id_foreign";`);

    // Drop old quote tables
    this.addSql(`drop table if exists "fms_quote_origin_ports" cascade;`);
    this.addSql(`drop table if exists "fms_quote_destination_ports" cascade;`);
    this.addSql(`drop table if exists "fms_quote_lines" cascade;`);
    this.addSql(`drop table if exists "fms_quotes" cascade;`);

    // Create new RFQ table
    this.addSql(`create table "fms_rfqs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "title" text null, "description" text null, "origin" text null, "destination" text null, "container_count" int null, "direction" text null, "transport_mode" text null, "cargo_type" text null, "company_name" text null, "contact_person" text null, "context" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_rfqs_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_rfqs_org_tenant_idx" on "fms_rfqs" ("organization_id", "tenant_id");`);

    // Create offer calculations table
    this.addSql(`create table "fms_offer_calculations" ("id" uuid not null default gen_random_uuid(), "offer_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "calculation_number" int not null default 1, "label" text null, "containers" jsonb null, "origin_location_id" uuid null, "destination_location_id" uuid null, "place_of_loading_id" uuid null, "place_of_delivery_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_offer_calculations_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_offer_calcs_offer_idx" on "fms_offer_calculations" ("offer_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "fms_offer_calcs_org_tenant_idx" on "fms_offer_calculations" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_offer_calculations" add constraint "fms_offer_calculations_offer_id_foreign" foreign key ("offer_id") references "fms_offers" ("id") on update cascade;`);

    // Restructure fms_offers: drop quote_id, add rfq_id + new fields
    this.addSql(`drop index if exists "fms_offers_quote_idx";`);
    this.addSql(`alter table "fms_offers" drop column "quote_id";`);
    this.addSql(`alter table "fms_offers" add column "rfq_id" uuid null, add column "direction" text null, add column "transport_mode" text null, add column "cargo_type" text null;`);
    this.addSql(`alter table "fms_offers" add constraint "fms_offers_rfq_id_foreign" foreign key ("rfq_id") references "fms_rfqs" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "fms_offers_rfq_idx" on "fms_offers" ("rfq_id", "organization_id", "tenant_id");`);

    // Restructure fms_offer_lines: offer_id → calculation_id + new columns
    this.addSql(`drop index if exists "fms_offer_lines_offer_idx";`);
    // Drop orphan columns from skipped intermediate migrations + restructuring columns
    this.addSql(`alter table "fms_offer_lines" drop column if exists "price_id";`);
    this.addSql(`alter table "fms_offer_lines" drop column if exists "product_type";`);
    this.addSql(`alter table "fms_offer_lines" drop column if exists "provider_name";`);
    this.addSql(`alter table "fms_offer_lines" drop column "variant_id", drop column "source_quote_line_id", drop column "container_size", drop column "provider_id", drop column "carrier_id", drop column "reference", drop column "validity_start", drop column "validity_end", drop column "unit_cost", drop column "unit_price", drop column "amount";`);
    this.addSql(`alter table "fms_offer_lines" add column "charge_basis" text null, add column "rate" numeric(18,4) not null default '0', add column "buy_price" numeric(18,4) not null default '0', add column "sell_price" numeric(18,4) not null default '0', add column "is_enabled" boolean not null default false;`);
    this.addSql(`alter table "fms_offer_lines" alter column "currency_code" type text using ("currency_code"::text);`);
    this.addSql(`alter table "fms_offer_lines" alter column "currency_code" set default 'USD';`);
    this.addSql(`alter table "fms_offer_lines" rename column "offer_id" to "calculation_id";`);

    // Data migration: create a default calculation for each offer that has lines,
    // then update lines to reference the new calculation
    this.addSql(`
      INSERT INTO "fms_offer_calculations" ("id", "offer_id", "organization_id", "tenant_id", "calculation_number", "label", "created_at", "updated_at")
      SELECT DISTINCT gen_random_uuid(), ol."calculation_id", ol."organization_id", ol."tenant_id", 1, 'Calculation 1', NOW(), NOW()
      FROM "fms_offer_lines" ol
      WHERE ol."calculation_id" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "fms_offer_calculations" oc WHERE oc."offer_id" = ol."calculation_id");
    `);
    this.addSql(`
      UPDATE "fms_offer_lines" ol
      SET "calculation_id" = oc."id"
      FROM "fms_offer_calculations" oc
      WHERE oc."offer_id" = ol."calculation_id";
    `);

    this.addSql(`alter table "fms_offer_lines" add constraint "fms_offer_lines_calculation_id_foreign" foreign key ("calculation_id") references "fms_offer_calculations" ("id") on update cascade;`);
    this.addSql(`create index "fms_offer_lines_calc_idx" on "fms_offer_lines" ("calculation_id", "organization_id", "tenant_id");`);
  }

}
