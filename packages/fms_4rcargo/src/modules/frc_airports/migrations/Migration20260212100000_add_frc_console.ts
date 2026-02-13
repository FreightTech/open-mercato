import { Migration } from '@mikro-orm/migrations';

export class Migration20260212100000_add_frc_console extends Migration {

  override async up(): Promise<void> {
    // ============================================
    // 1. frc_consoles (depends on frc_trucks, frc_airports)
    // ============================================
    this.addSql(`create table "frc_consoles" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "date" date not null, "truck_id" uuid not null, "origin_airport_id" uuid null, "destination_airport_id" uuid null, "status" text not null default 'planning', "truck_preset_id" text not null default 'standard', "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_consoles_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_consoles_org_tenant_idx" on "frc_consoles" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_consoles_truck_date_idx" on "frc_consoles" ("truck_id", "date", "organization_id", "tenant_id");`);
    this.addSql(`create index "frc_consoles_status_idx" on "frc_consoles" ("organization_id", "tenant_id", "status");`);

    this.addSql(`alter table "frc_consoles" add constraint "frc_consoles_truck_id_foreign" foreign key ("truck_id") references "frc_trucks" ("id") on update cascade;`);
    this.addSql(`alter table "frc_consoles" add constraint "frc_consoles_origin_airport_id_foreign" foreign key ("origin_airport_id") references "frc_airports" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "frc_consoles" add constraint "frc_consoles_destination_airport_id_foreign" foreign key ("destination_airport_id") references "frc_airports" ("id") on update cascade on delete set null;`);

    // ============================================
    // 2. frc_console_items (depends on frc_consoles)
    // References air_cargo_id and truck_booking_id as plain UUIDs (no FK constraint)
    // ============================================
    this.addSql(`create table "frc_console_items" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "console_id" uuid not null, "air_cargo_id" uuid not null, "truck_booking_id" uuid not null, "quantity" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_console_items_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_console_items_org_tenant_idx" on "frc_console_items" ("organization_id", "tenant_id");`);
    this.addSql(`create index "frc_console_items_console_idx" on "frc_console_items" ("console_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "frc_console_items_cargo_idx" on "frc_console_items" ("air_cargo_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "frc_console_items_booking_idx" on "frc_console_items" ("truck_booking_id", "organization_id", "tenant_id");`);

    this.addSql(`alter table "frc_console_items" add constraint "frc_console_items_console_id_foreign" foreign key ("console_id") references "frc_consoles" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "frc_console_items" cascade;`);
    this.addSql(`drop table if exists "frc_consoles" cascade;`);
  }

}
