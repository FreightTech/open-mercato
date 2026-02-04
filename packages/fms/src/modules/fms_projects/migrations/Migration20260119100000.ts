import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Multi-Modal Transport Units
 *
 * This migration transforms the single container model into multi-modal transport units:
 * - Rename fms_project_containers → fms_sea_containers (with new fields)
 * - Create fms_air_units table
 * - Create fms_road_units table
 */
export class Migration20260119100000 extends Migration {
  override async up(): Promise<void> {
    // ===========================================================================
    // Step 1: Drop existing constraints and indexes from fms_project_containers
    // ===========================================================================

    this.addSql(`alter table if exists "fms_project_containers" drop constraint if exists "fms_project_containers_project_id_foreign";`)
    this.addSql(`drop index if exists "fms_project_containers_org_tenant_idx";`)
    this.addSql(`drop index if exists "fms_project_containers_project_idx";`)
    this.addSql(`drop index if exists "fms_project_containers_number_idx";`)

    // ===========================================================================
    // Step 2: Rename table and modify columns
    // ===========================================================================

    this.addSql(`alter table "fms_project_containers" rename to "fms_sea_containers";`)

    // Remove old columns that are no longer needed
    this.addSql(`alter table "fms_sea_containers" drop column if exists "length";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "width";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "height";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "dimension_unit";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "tare_weight";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "gross_weight";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "net_weight";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "weight_unit";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "commodity_description";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "package_count";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "is_reefer";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "temperature_min";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "temperature_max";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "temperature_unit";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "hazmat_class";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "un_number";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "pickup_date";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "delivery_date";`)

    // Add new columns for sea containers
    this.addSql(`alter table "fms_sea_containers" add column if not exists "booking_number" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "bl_number" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "vessel_name" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "vessel_imo" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "voyage_number" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "origin_port" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "destination_port" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "etd" timestamptz null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "eta" timestamptz null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "atd" timestamptz null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "ata" timestamptz null;`)

    // ===========================================================================
    // Step 3: Recreate indexes and constraints for fms_sea_containers
    // ===========================================================================

    this.addSql(`create index if not exists "fms_sea_containers_org_tenant_idx" on "fms_sea_containers" ("organization_id", "tenant_id");`)
    this.addSql(`create index if not exists "fms_sea_containers_project_idx" on "fms_sea_containers" ("project_id");`)
    this.addSql(`create index if not exists "fms_sea_containers_number_idx" on "fms_sea_containers" ("container_number");`)
    this.addSql(`
      do $$ begin
        alter table "fms_sea_containers" add constraint "fms_sea_containers_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;
      exception when others then null; end $$;
    `);

    // ===========================================================================
    // Step 4: Create fms_air_units table
    // ===========================================================================

    this.addSql(`
      create table "fms_air_units" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "project_id" uuid not null,

        -- Status & Handling
        "delivery_status" text not null default 'awaiting',
        "is_loose" boolean not null default true,
        "is_stackable" boolean not null default true,
        "is_dgr" boolean not null default false,
        "dgr_un_number" text null,
        "dgr_class" text null,

        -- Cargo Dimensions
        "pieces" integer null,
        "gross_weight" numeric(18, 4) null,
        "chargeable_weight" numeric(18, 4) null,
        "volume" numeric(18, 4) null,
        "loading_meters" numeric(18, 4) null,

        -- Cargo Info
        "commodity" text null,
        "description" text null,
        "target_rate" numeric(18, 4) null,

        -- Unit Info (Optional)
        "unit_type" text null,
        "unit_number" text null,

        -- Routing
        "origin_type" text not null default 'airport',
        "origin_airport" text null,
        "destination_airport" text null,

        -- Dates
        "shipment_ready_date" timestamptz null,
        "required_at_destination" timestamptz null,
        "etd" timestamptz null,
        "eta" timestamptz null,
        "atd" timestamptz null,
        "ata" timestamptz null,

        -- Shipping References
        "mawb_number" text null,
        "hawb_number" text null,
        "booking_number" text null,

        -- Flight Info
        "flight_number" text null,
        "carrier_code" text null,
        "aircraft_type" text null,

        -- Notes
        "notes" text null,

        -- Timestamps
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,

        constraint "fms_air_units_pkey" primary key ("id")
      );
    `)

    this.addSql(`create index if not exists "fms_air_units_org_tenant_idx" on "fms_air_units" ("organization_id", "tenant_id");`)
    this.addSql(`create index if not exists "fms_air_units_project_idx" on "fms_air_units" ("project_id");`)
    this.addSql(`create index if not exists "fms_air_units_mawb_idx" on "fms_air_units" ("mawb_number");`)
    this.addSql(`
      do $$ begin
        alter table "fms_air_units" add constraint "fms_air_units_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;
      exception when others then null; end $$;
    `);

    // ===========================================================================
    // Step 5: Create fms_road_units table
    // ===========================================================================

    this.addSql(`
      create table "fms_road_units" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "project_id" uuid not null,

        -- Vehicle Info
        "vehicle_type" text not null,
        "truck_number" text null,
        "trailer_number" text null,
        "driver_name" text null,
        "driver_phone" text null,

        -- Shipping References
        "cmr_number" text null,
        "booking_number" text null,

        -- Carrier
        "carrier_name" text null,
        "carrier_contact" text null,

        -- Routing
        "origin_address" text null,
        "destination_address" text null,

        -- Dates
        "pickup_date" timestamptz null,
        "delivery_date" timestamptz null,
        "actual_pickup" timestamptz null,
        "actual_delivery" timestamptz null,

        -- Cargo
        "pieces" integer null,
        "gross_weight" numeric(18, 4) null,
        "pallet_spaces" integer null,
        "loading_meters" numeric(18, 4) null,

        -- Status
        "status" text not null default 'not_ready',
        "is_hazardous" boolean not null default false,

        -- Notes
        "notes" text null,

        -- Timestamps
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,

        constraint "fms_road_units_pkey" primary key ("id")
      );
    `)

    this.addSql(`create index if not exists "fms_road_units_org_tenant_idx" on "fms_road_units" ("organization_id", "tenant_id");`)
    this.addSql(`create index if not exists "fms_road_units_project_idx" on "fms_road_units" ("project_id");`)
    this.addSql(`create index if not exists "fms_road_units_cmr_idx" on "fms_road_units" ("cmr_number");`)
    this.addSql(`
      do $$ begin
        alter table "fms_road_units" add constraint "fms_road_units_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;
      exception when others then null; end $$;
    `);
  }

  override async down(): Promise<void> {
    // ===========================================================================
    // Drop new tables
    // ===========================================================================

    this.addSql(`drop table if exists "fms_road_units" cascade;`)
    this.addSql(`drop table if exists "fms_air_units" cascade;`)

    // ===========================================================================
    // Reverse sea containers changes
    // ===========================================================================

    this.addSql(`alter table if exists "fms_sea_containers" drop constraint if exists "fms_sea_containers_project_id_foreign";`)
    this.addSql(`drop index if exists "fms_sea_containers_org_tenant_idx";`)
    this.addSql(`drop index if exists "fms_sea_containers_project_idx";`)
    this.addSql(`drop index if exists "fms_sea_containers_number_idx";`)

    // Remove new columns
    this.addSql(`alter table "fms_sea_containers" drop column if exists "booking_number";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "bl_number";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "vessel_name";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "vessel_imo";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "voyage_number";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "origin_port";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "destination_port";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "etd";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "eta";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "atd";`)
    this.addSql(`alter table "fms_sea_containers" drop column if exists "ata";`)

    // Add back old columns
    this.addSql(`alter table "fms_sea_containers" add column if not exists "length" numeric(18, 4) null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "width" numeric(18, 4) null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "height" numeric(18, 4) null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "dimension_unit" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "tare_weight" numeric(18, 4) null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "gross_weight" numeric(18, 4) null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "net_weight" numeric(18, 4) null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "weight_unit" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "commodity_description" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "package_count" integer null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "is_reefer" boolean not null default false;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "temperature_min" numeric(18, 4) null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "temperature_max" numeric(18, 4) null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "temperature_unit" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "hazmat_class" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "un_number" text null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "pickup_date" timestamptz null;`)
    this.addSql(`alter table "fms_sea_containers" add column if not exists "delivery_date" timestamptz null;`)

    // Rename back to fms_project_containers
    this.addSql(`alter table "fms_sea_containers" rename to "fms_project_containers";`)

    // Recreate original indexes and constraints
    this.addSql(`create index if not exists "fms_project_containers_org_tenant_idx" on "fms_project_containers" ("organization_id", "tenant_id");`)
    this.addSql(`create index if not exists "fms_project_containers_project_idx" on "fms_project_containers" ("project_id");`)
    this.addSql(`create index if not exists "fms_project_containers_number_idx" on "fms_project_containers" ("container_number");`)
    this.addSql(`
      do $$ begin
        alter table "fms_project_containers" add constraint "fms_project_containers_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;
      exception when others then null; end $$;
    `);
  }
}
