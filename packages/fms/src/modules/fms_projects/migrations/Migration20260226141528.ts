import { Migration } from '@mikro-orm/migrations';

export class Migration20260226141528 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_sea_containers" drop column "bl_number", drop column "origin_port", drop column "destination_port", drop column "etd", drop column "eta", drop column "atd", drop column "ata";`);

    this.addSql(`alter table "fms_sea_containers" add column "bol_number" text null, add column "carrier_code" text null, add column "origin_location" jsonb null, add column "destination_location" jsonb null, add column "etd_timestamps" jsonb null, add column "eta_timestamps" jsonb null, add column "atd_timestamps" jsonb null, add column "ata_timestamps" jsonb null, add column "route_stops" jsonb null, add column "cargo_events" jsonb null, add column "event_count" int not null default 0, add column "last_event_at" timestamptz null, add column "tracked_shipment_id" uuid null, add column "last_synced_at" timestamptz null, add column "sync_status" text null, add column "is_active" boolean not null default true, add column "extra" jsonb null;`);
    this.addSql(`alter table "fms_sea_containers" alter column "status" type text using ("status"::text);`);
    this.addSql(`alter table "fms_sea_containers" alter column "status" set default 'PENDING';`);
    this.addSql(`create index "fms_sea_containers_tracked_shipment_idx" on "fms_sea_containers" ("tracked_shipment_id");`);
    this.addSql(`create index "fms_sea_containers_status_idx" on "fms_sea_containers" ("organization_id", "tenant_id", "status");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "fms_sea_containers_tracked_shipment_idx";`);
    this.addSql(`drop index "fms_sea_containers_status_idx";`);
    this.addSql(`alter table "fms_sea_containers" drop column "bol_number", drop column "carrier_code", drop column "origin_location", drop column "destination_location", drop column "etd_timestamps", drop column "eta_timestamps", drop column "atd_timestamps", drop column "ata_timestamps", drop column "route_stops", drop column "cargo_events", drop column "event_count", drop column "last_event_at", drop column "tracked_shipment_id", drop column "last_synced_at", drop column "sync_status", drop column "is_active", drop column "extra";`);

    this.addSql(`alter table "fms_sea_containers" add column "bl_number" text null, add column "origin_port" text null, add column "destination_port" text null, add column "etd" timestamptz null, add column "eta" timestamptz null, add column "atd" timestamptz null, add column "ata" timestamptz null;`);
    this.addSql(`alter table "fms_sea_containers" alter column "status" type text using ("status"::text);`);
    this.addSql(`alter table "fms_sea_containers" alter column "status" set default 'not_ready';`);
  }

}
