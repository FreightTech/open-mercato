import { Migration } from '@mikro-orm/migrations';

export class Migration20260211170000_frc_consolidated extends Migration {

  override async up(): Promise<void> {
    // ============================================
    // 1. frc_airports (base table - no dependencies)
    // ============================================
    this.addSql(`create table "frc_airports" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "long_code" text not null, "city" text null, "country" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_airports_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_airports_org_tenant_idx" on "frc_airports" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_airports_code_idx" on "frc_airports" ("organization_id", "tenant_id", "code");`);

    // ============================================
    // 2. frc_rfqs (depends on frc_airports)
    // ============================================
    this.addSql(`create table "frc_rfqs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "account_id" uuid null, "contact_id" uuid null, "sales_stage" text not null default 'received', "probability" int not null default 0, "amount" numeric(18,4) null, "currency_code" text not null default 'EUR', "delivery_status" text not null default 'awaiting', "is_delayed" boolean not null default false, "origin_type" text not null default 'airport', "origin_airport_id" uuid null, "destination_airport_id" uuid null, "shipment_ready_date" date null, "required_at_destination_date" date null, "loose_or_unitised" text null, "target_rate" numeric(18,4) null, "product" text null, "commodity" text null, "total_pieces" int not null default 0, "total_volume" numeric(18,4) not null default '0', "total_actual_weight" numeric(18,4) not null default '0', "total_chargeable_weight" numeric(18,4) not null default '0', "total_loading_metres" numeric(18,4) not null default '0', "description" text null, "assigned_to_id" uuid null, "request_date" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_rfqs_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_rfqs_org_tenant_idx" on "frc_rfqs" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_rfqs_status_idx" on "frc_rfqs" ("organization_id", "tenant_id", "sales_stage");`);
    this.addSql(`create index "frc_rfqs_account_idx" on "frc_rfqs" ("organization_id", "tenant_id", "account_id");`);

    this.addSql(`alter table "frc_rfqs" add constraint "frc_rfqs_origin_airport_id_foreign" foreign key ("origin_airport_id") references "frc_airports" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "frc_rfqs" add constraint "frc_rfqs_destination_airport_id_foreign" foreign key ("destination_airport_id") references "frc_airports" ("id") on update cascade on delete set null;`);

    // ============================================
    // 3. frc_air_cargo (depends on frc_rfqs)
    // ============================================
    this.addSql(`create table "frc_air_cargo" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "rfq_id" uuid not null, "name" text not null, "number_of_pieces" int not null default 1, "stackable_type" text not null default 'fully_stackable', "length_cm" numeric(12,2) null, "width_cm" numeric(12,2) null, "height_cm" numeric(12,2) null, "volume_m3" numeric(18,4) not null default '0', "actual_weight_kg" numeric(18,4) not null default '0', "chargeable_weight_kg" numeric(18,4) not null default '0', "loading_metres" numeric(18,4) not null default '0', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_air_cargo_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_air_cargo_org_tenant_idx" on "frc_air_cargo" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_air_cargo_rfq_idx" on "frc_air_cargo" ("rfq_id", "organization_id", "tenant_id");`);

    this.addSql(`alter table "frc_air_cargo" add constraint "frc_air_cargo_rfq_id_foreign" foreign key ("rfq_id") references "frc_rfqs" ("id") on update cascade;`);

    // ============================================
    // 4. frc_offers (no FK dependencies on other frc_ tables)
    // ============================================
    this.addSql(`create table "frc_offers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "rfq_id" uuid not null, "name" text not null, "carrier_id" uuid null, "status" text not null default 'draft', "awb_number" text null, "connection_method" text null, "departure_date" date null, "connection_rate_per_kg" numeric(18,4) null, "connection_rate_total" numeric(18,4) null, "airfreight_rate_per_kg" numeric(18,4) null, "airfreight_rate_total" numeric(18,4) null, "total_rate_per_kg" numeric(18,4) null, "total_rate" numeric(18,4) null, "currency_code" text not null default 'EUR', "assigned_to_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_offers_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_offers_org_tenant_idx" on "frc_offers" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_offers_rfq_idx" on "frc_offers" ("rfq_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "frc_offers_status_idx" on "frc_offers" ("organization_id", "tenant_id", "status");`);

    // ============================================
    // 5. frc_air_routing (depends on frc_offers, frc_airports)
    // ============================================
    this.addSql(`create table "frc_air_routing" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "offer_id" uuid not null, "name" text not null, "carrier_id" uuid null, "carrier_type" text null, "flight_number" text null, "type" text not null default 'direct_flight', "origin_airport_id" uuid null, "destination_airport_id" uuid null, "departure_date" date null, "departure_time" text null, "arrival_date" date null, "arrival_time" text null, "connection_rate_total" numeric(18,4) null, "currency_code" text not null default 'EUR', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_air_routing_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_air_routing_org_tenant_idx" on "frc_air_routing" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_air_routing_offer_idx" on "frc_air_routing" ("offer_id", "organization_id", "tenant_id");`);

    this.addSql(`alter table "frc_air_routing" add constraint "frc_air_routing_offer_id_foreign" foreign key ("offer_id") references "frc_offers" ("id") on update cascade;`);
    this.addSql(`alter table "frc_air_routing" add constraint "frc_air_routing_origin_airport_id_foreign" foreign key ("origin_airport_id") references "frc_airports" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "frc_air_routing" add constraint "frc_air_routing_destination_airport_id_foreign" foreign key ("destination_airport_id") references "frc_airports" ("id") on update cascade on delete set null;`);

    // ============================================
    // 6. frc_trucks (no FK dependencies)
    // ============================================
    this.addSql(`create table "frc_trucks" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_trucks_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_trucks_org_tenant_idx" on "frc_trucks" ("organization_id", "tenant_id");`);

    // ============================================
    // 7. frc_truck_bookings (depends on frc_trucks, frc_airports)
    // ============================================
    this.addSql(`create table "frc_truck_bookings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "air_routing_id" uuid not null, "truck_id" uuid not null, "origin_airport_id" uuid null, "destination_airport_id" uuid null, "date" date null, "profit_loss" numeric(18,4) null, "chargeable_weight" numeric(18,4) null, "connection_rate" numeric(18,4) null, "total_truck_cost" numeric(18,4) null, "status" text not null default 'draft', "currency_code" text not null default 'EUR', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_truck_bookings_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_truck_bookings_org_tenant_idx" on "frc_truck_bookings" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_truck_bookings_routing_idx" on "frc_truck_bookings" ("air_routing_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "frc_truck_bookings_truck_idx" on "frc_truck_bookings" ("truck_id", "organization_id", "tenant_id");`);

    this.addSql(`alter table "frc_truck_bookings" add constraint "frc_truck_bookings_truck_id_foreign" foreign key ("truck_id") references "frc_trucks" ("id") on update cascade;`);
    this.addSql(`alter table "frc_truck_bookings" add constraint "frc_truck_bookings_origin_airport_id_foreign" foreign key ("origin_airport_id") references "frc_airports" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "frc_truck_bookings" add constraint "frc_truck_bookings_destination_airport_id_foreign" foreign key ("destination_airport_id") references "frc_airports" ("id") on update cascade on delete set null;`);

    // ============================================
    // 8. frc_projects (no FK constraints - uses plain UUID fields)
    // ============================================
    this.addSql(`create table "frc_projects" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_number" text not null, "rfq_id" uuid null, "offer_id" uuid null, "account_id" uuid null, "status" text not null default 'active', "total_value" numeric(18,4) null, "currency_code" text not null default 'EUR', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_projects_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_projects_org_tenant_idx" on "frc_projects" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_projects_status_idx" on "frc_projects" ("organization_id", "tenant_id", "status");`);
    this.addSql(`create index "frc_projects_account_idx" on "frc_projects" ("organization_id", "tenant_id", "account_id");`);
  }

  override async down(): Promise<void> {
    // Drop tables in reverse dependency order
    this.addSql(`drop table if exists "frc_projects" cascade;`);
    this.addSql(`drop table if exists "frc_truck_bookings" cascade;`);
    this.addSql(`drop table if exists "frc_trucks" cascade;`);
    this.addSql(`drop table if exists "frc_air_routing" cascade;`);
    this.addSql(`drop table if exists "frc_offers" cascade;`);
    this.addSql(`drop table if exists "frc_air_cargo" cascade;`);
    this.addSql(`drop table if exists "frc_rfqs" cascade;`);
    this.addSql(`drop table if exists "frc_airports" cascade;`);
  }

}
