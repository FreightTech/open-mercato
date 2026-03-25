import { Migration } from '@mikro-orm/migrations';

export class Migration20260318113725 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_files" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "reference_number" text not null, "shipment_type" text not null, "cargo_type" text not null, "contractor_id" uuid not null, "assignee_id" uuid null, "notes" text null, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_files_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_files_contractor_idx" on "fms_files" ("contractor_id");`);
    this.addSql(`create index "fms_files_org_tenant_idx" on "fms_files" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_number_unique" unique ("organization_id", "reference_number");`);

    this.addSql(`create table "fms_file_legs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "leg_sequence" int not null, "type" text not null, "origin_location_id" uuid not null, "destination_location_id" uuid not null, "ptd_timestamps" jsonb null, "etd_timestamps" jsonb null, "atd_timestamps" jsonb null, "pta_timestamps" jsonb null, "eta_timestamps" jsonb null, "ata_timestamps" jsonb null, "booking_number" text null, "carrier_id" uuid null, "bl_number" text null, "vessel_name" text null, "vessel_imo" text null, "voyage_number" text null, "flight_number" text null, "aircraft_type" text null, "notes" text null, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, "file_id" uuid not null, constraint "fms_file_legs_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_file_legs_sequence_idx" on "fms_file_legs" ("file_id", "leg_sequence");`);
    this.addSql(`create index "fms_file_legs_file_idx" on "fms_file_legs" ("file_id");`);

    this.addSql(`create table "fms_file_units" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "cargo_type" text not null, "origin_location_id" uuid not null, "destination_location_id" uuid not null, "commodity_description" text null, "gross_weight" numeric(12,3) null, "weight_unit" text null, "volume" numeric(12,3) null, "volume_unit" text null, "is_hazardous" boolean not null default false, "container_number" text null, "container_type" text null, "package_count" int null, "packages_detail" jsonb null, "sort_order" int not null default 0, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "file_id" uuid not null, constraint "fms_file_units_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_file_units_cargo_type_idx" on "fms_file_units" ("cargo_type");`);
    this.addSql(`create index "fms_file_units_file_idx" on "fms_file_units" ("file_id");`);

    this.addSql(`create table "fms_file_unit_legs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "truck_plate" text null, "trailer_plate" text null, "driver_full_name" text null, "driver_id_number" text null, "driver_phone" text null, "seal_number" text null, "bl_number" text null, "consolidation_container_number" text null, "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "unit_id" uuid not null, "leg_id" uuid not null, constraint "fms_file_unit_legs_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_file_unit_legs_leg_idx" on "fms_file_unit_legs" ("leg_id");`);
    this.addSql(`create index "fms_file_unit_legs_unit_idx" on "fms_file_unit_legs" ("unit_id");`);
    this.addSql(`alter table "fms_file_unit_legs" add constraint "fms_file_unit_legs_unit_leg_unique" unique ("organization_id", "unit_id", "leg_id");`);

    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade;`);
    this.addSql(`alter table "fms_file_units" add constraint "fms_file_units_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade;`);
    this.addSql(`alter table "fms_file_unit_legs" add constraint "fms_file_unit_legs_unit_id_foreign" foreign key ("unit_id") references "fms_file_units" ("id") on update cascade;`);
    this.addSql(`alter table "fms_file_unit_legs" add constraint "fms_file_unit_legs_leg_id_foreign" foreign key ("leg_id") references "fms_file_legs" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_file_unit_legs" drop constraint "fms_file_unit_legs_unit_id_foreign";`);
    this.addSql(`alter table "fms_file_unit_legs" drop constraint "fms_file_unit_legs_leg_id_foreign";`);
    this.addSql(`alter table "fms_file_legs" drop constraint "fms_file_legs_file_id_foreign";`);
    this.addSql(`alter table "fms_file_units" drop constraint "fms_file_units_file_id_foreign";`);

    this.addSql(`drop table if exists "fms_file_unit_legs";`);
    this.addSql(`drop table if exists "fms_file_legs";`);
    this.addSql(`drop table if exists "fms_file_units";`);
    this.addSql(`drop table if exists "fms_files";`);
  }

}
