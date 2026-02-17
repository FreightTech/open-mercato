import { Migration } from '@mikro-orm/migrations';

/**
 * Consolidated migration for all frc_ tables.
 * 
 * Schema changes from previous version:
 * - frc_airports: REMOVED - airports now stored in fms_locations (STI pattern with type='airport')
 * - frc_truck_bookings: REMOVED - merged into frc_consoles
 * - frc_console_items: RENAMED to frc_console_cargo, removed truck_booking_id
 * - Airport references: Now plain UUIDs referencing fms_locations (no FK constraints)
 * - Added: frc_offer_lines, frc_project_air_cargo tables
 * - Added: project_id to frc_offers, merged booking fields to frc_consoles
 */
export class Migration20260217120000_frc_consolidated extends Migration {

  override async up(): Promise<void> {
    // ============================================
    // 1. frc_trucks (no dependencies)
    // ============================================
    this.addSql(`create table "frc_trucks" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_trucks_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_trucks_org_tenant_idx" on "frc_trucks" ("organization_id", "tenant_id");`);

    // ============================================
    // 2. frc_truck_presets (no dependencies)
    // ============================================
    this.addSql(`create table "frc_truck_presets" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "width" integer not null, "length" integer not null, "height" integer not null, "max_weight" integer not null, "volume" integer not null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "frc_truck_presets_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_truck_presets_org_tenant_idx" on "frc_truck_presets" ("organization_id", "tenant_id");`);

    // ============================================
    // 3. frc_rfqs (no FK dependencies - airport IDs are plain UUIDs to fms_locations)
    // ============================================
    this.addSql(`create table "frc_rfqs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "account_id" uuid null, "contact_id" uuid null, "sales_stage" text not null default 'received', "probability" int not null default 0, "amount" numeric(18,4) null, "currency_code" text not null default 'EUR', "delivery_status" text not null default 'awaiting', "is_delayed" boolean not null default false, "origin_type" text not null default 'airport', "origin_airport_id" uuid null, "destination_airport_id" uuid null, "shipment_ready_date" date null, "required_at_destination_date" date null, "loose_or_unitised" text null, "target_rate" numeric(18,4) null, "product" text null, "commodity" text null, "total_pieces" int not null default 0, "total_volume" numeric(18,4) not null default '0', "total_actual_weight" numeric(18,4) not null default '0', "total_chargeable_weight" numeric(18,4) not null default '0', "total_loading_metres" numeric(18,4) not null default '0', "description" text null, "assigned_to_id" uuid null, "request_date" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_rfqs_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_rfqs_org_tenant_idx" on "frc_rfqs" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_rfqs_status_idx" on "frc_rfqs" ("organization_id", "tenant_id", "sales_stage");`);
    this.addSql(`create index "frc_rfqs_account_idx" on "frc_rfqs" ("organization_id", "tenant_id", "account_id");`);

    // ============================================
    // 4. frc_air_cargo (depends on frc_rfqs)
    // ============================================
    this.addSql(`create table "frc_air_cargo" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "rfq_id" uuid not null, "name" text not null, "number_of_pieces" int not null default 1, "stackable_type" text not null default 'fully_stackable', "length_cm" numeric(12,2) null, "width_cm" numeric(12,2) null, "height_cm" numeric(12,2) null, "volume_m3" numeric(18,4) not null default '0', "actual_weight_kg" numeric(18,4) not null default '0', "chargeable_weight_kg" numeric(18,4) not null default '0', "loading_metres" numeric(18,4) not null default '0', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_air_cargo_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_air_cargo_org_tenant_idx" on "frc_air_cargo" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_air_cargo_rfq_idx" on "frc_air_cargo" ("rfq_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "frc_air_cargo" add constraint "frc_air_cargo_rfq_id_foreign" foreign key ("rfq_id") references "frc_rfqs" ("id") on update cascade;`);

    // ============================================
    // 5. frc_projects (no FK constraints - uses plain UUID fields)
    // ============================================
    this.addSql(`create table "frc_projects" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_number" text not null, "rfq_id" uuid null, "offer_id" uuid null, "account_id" uuid null, "status" text not null default 'active', "total_value" numeric(18,4) null, "currency_code" text not null default 'EUR', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_projects_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_projects_org_tenant_idx" on "frc_projects" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_projects_status_idx" on "frc_projects" ("organization_id", "tenant_id", "status");`);
    this.addSql(`create index "frc_projects_account_idx" on "frc_projects" ("organization_id", "tenant_id", "account_id");`);

    // ============================================
    // 6. frc_project_air_cargo (junction table for projects <-> air cargo)
    // ============================================
    this.addSql(`create table "frc_project_air_cargo" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "air_cargo_id" uuid not null, "quantity" int not null default 1, "created_at" timestamptz not null, constraint "frc_project_air_cargo_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_project_air_cargo_org_tenant_idx" on "frc_project_air_cargo" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_project_air_cargo_project_idx" on "frc_project_air_cargo" ("project_id");`);
    this.addSql(`create index "frc_project_air_cargo_cargo_idx" on "frc_project_air_cargo" ("air_cargo_id");`);

    // ============================================
    // 7. frc_offers (no FK constraints - rfq_id, project_id are plain UUIDs)
    // ============================================
    this.addSql(`create table "frc_offers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "rfq_id" uuid not null, "name" text not null, "carrier_id" uuid null, "status" text not null default 'draft', "awb_number" text null, "connection_method" text null, "departure_date" date null, "connection_rate_per_kg" numeric(18,4) null, "connection_rate_total" numeric(18,4) null, "airfreight_rate_per_kg" numeric(18,4) null, "airfreight_rate_total" numeric(18,4) null, "total_rate_per_kg" numeric(18,4) null, "total_rate" numeric(18,4) null, "currency_code" text not null default 'EUR', "assigned_to_id" uuid null, "project_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_offers_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_offers_org_tenant_idx" on "frc_offers" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_offers_rfq_idx" on "frc_offers" ("rfq_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "frc_offers_status_idx" on "frc_offers" ("organization_id", "tenant_id", "status");`);
    this.addSql(`create index "frc_offers_project_idx" on "frc_offers" ("project_id", "organization_id", "tenant_id");`);

    // ============================================
    // 8. frc_offer_lines (depends on frc_offers)
    // ============================================
    this.addSql(`create table "frc_offer_lines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "offer_id" uuid not null, "source_air_cargo_id" uuid null, "name" text not null, "number_of_pieces" int not null default 1, "stackable_type" text not null default 'fully_stackable', "length_cm" numeric(12,2) null, "width_cm" numeric(12,2) null, "height_cm" numeric(12,2) null, "volume_m3" numeric(18,4) not null default '0', "actual_weight_kg" numeric(18,4) not null default '0', "chargeable_weight_kg" numeric(18,4) not null default '0', "loading_metres" numeric(18,4) not null default '0', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_offer_lines_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_offer_lines_org_tenant_idx" on "frc_offer_lines" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_offer_lines_offer_idx" on "frc_offer_lines" ("offer_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "frc_offer_lines" add constraint "frc_offer_lines_offer_id_foreign" foreign key ("offer_id") references "frc_offers" ("id") on update cascade;`);

    // ============================================
    // 9. frc_air_routing (depends on frc_offers - airport IDs are plain UUIDs to fms_locations)
    // ============================================
    this.addSql(`create table "frc_air_routing" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "offer_id" uuid not null, "name" text not null, "carrier_id" uuid null, "carrier_type" text null, "flight_number" text null, "type" text not null default 'direct_flight', "origin_airport_id" uuid null, "destination_airport_id" uuid null, "departure_date" date null, "departure_time" text null, "arrival_date" date null, "arrival_time" text null, "connection_rate_total" numeric(18,4) null, "currency_code" text not null default 'EUR', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_air_routing_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_air_routing_org_tenant_idx" on "frc_air_routing" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_air_routing_offer_idx" on "frc_air_routing" ("offer_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "frc_air_routing" add constraint "frc_air_routing_offer_id_foreign" foreign key ("offer_id") references "frc_offers" ("id") on update cascade;`);

    // ============================================
    // 10. frc_consoles (depends on frc_trucks, frc_truck_presets - airport IDs are plain UUIDs)
    // Includes merged fields from former frc_truck_bookings
    // ============================================
    this.addSql(`create table "frc_consoles" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "date" date not null, "truck_id" uuid not null, "origin_airport_id" uuid null, "destination_airport_id" uuid null, "status" text not null default 'planning', "truck_preset_id" uuid null, "notes" text null, "project_id" uuid null, "air_routing_id" uuid null, "profit_loss" numeric(18,4) null, "chargeable_weight" numeric(18,4) null, "connection_rate" numeric(18,4) null, "total_truck_cost" numeric(18,4) null, "currency_code" text not null default 'EUR', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_consoles_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_consoles_org_tenant_idx" on "frc_consoles" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_consoles_truck_date_idx" on "frc_consoles" ("truck_id", "date", "organization_id", "tenant_id");`);
    this.addSql(`create index "frc_consoles_status_idx" on "frc_consoles" ("organization_id", "tenant_id", "status");`);
    this.addSql(`create index "frc_consoles_project_idx" on "frc_consoles" ("project_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "frc_consoles" add constraint "frc_consoles_truck_id_foreign" foreign key ("truck_id") references "frc_trucks" ("id") on update cascade;`);
    this.addSql(`alter table "frc_consoles" add constraint "frc_consoles_truck_preset_id_foreign" foreign key ("truck_preset_id") references "frc_truck_presets" ("id") on update cascade on delete set null;`);

    // ============================================
    // 11. frc_console_cargo (depends on frc_consoles - air_cargo_id is plain UUID)
    // ============================================
    this.addSql(`create table "frc_console_cargo" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "console_id" uuid not null, "air_cargo_id" uuid not null, "quantity" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_console_cargo_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_console_cargo_org_tenant_idx" on "frc_console_cargo" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_console_cargo_console_idx" on "frc_console_cargo" ("console_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "frc_console_cargo_cargo_idx" on "frc_console_cargo" ("air_cargo_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "frc_console_cargo" add constraint "frc_console_cargo_console_id_foreign" foreign key ("console_id") references "frc_consoles" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    // Drop tables in reverse dependency order
    this.addSql(`drop table if exists "frc_console_cargo" cascade;`);
    this.addSql(`drop table if exists "frc_consoles" cascade;`);
    this.addSql(`drop table if exists "frc_air_routing" cascade;`);
    this.addSql(`drop table if exists "frc_offer_lines" cascade;`);
    this.addSql(`drop table if exists "frc_offers" cascade;`);
    this.addSql(`drop table if exists "frc_project_air_cargo" cascade;`);
    this.addSql(`drop table if exists "frc_projects" cascade;`);
    this.addSql(`drop table if exists "frc_air_cargo" cascade;`);
    this.addSql(`drop table if exists "frc_rfqs" cascade;`);
    this.addSql(`drop table if exists "frc_truck_presets" cascade;`);
    this.addSql(`drop table if exists "frc_trucks" cascade;`);
  }

}
