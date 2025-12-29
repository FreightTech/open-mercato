import { Migration } from '@mikro-orm/migrations';

export class Migration20251229093811 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_tracking_locations" ("id" uuid not null default gen_random_uuid(), "name" text not null, "city" text not null, "state" text not null, "country" text not null, "unlocode" text not null, "firms_cd" text null, "bic_cd" text null, "smdg_cd" text null, "facility" text null, "latitude" real not null, "longitude" real not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "fms_tracking_locations_pkey" primary key ("id"));`);

    this.addSql(`create table "fms_tracking_webhook_events" ("reference_id" uuid not null, "id" uuid not null, "parent_reference_id" uuid null, "status" text not null, "organization_id" uuid not null, "container_id" text not null, "carrier_scac" text not null, "container_iso" text not null, "bill_of_lading" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "fms_tracking_webhook_events_pkey" primary key ("reference_id"));`);

    this.addSql(`create table "fms_tracking_milestones" ("id" uuid not null default gen_random_uuid(), "webhook_event_reference_id" uuid not null, "timestamp" timestamptz not null, "location_id" uuid not null, "description" text not null, "raw_description" text not null, "journey_type" text not null, "event_classifier" text not null, "event_type" text not null, "empty_indicator" text null, "transport_mode" text null, "facility_type" text null, "document_type" text null, "type_code" text null, "vessel" text null, "vessel_imo" text null, "vessel_mmsi" text null, "voyage" text null, "planned" boolean not null, "mode" text null, "source" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "fms_tracking_milestones_pkey" primary key ("id"));`);

    this.addSql(`alter table "fms_tracking_milestones" add constraint "fms_tracking_milestones_webhook_event_reference_id_foreign" foreign key ("webhook_event_reference_id") references "fms_tracking_webhook_events" ("reference_id") on update cascade;`);
    this.addSql(`alter table "fms_tracking_milestones" add constraint "fms_tracking_milestones_location_id_foreign" foreign key ("location_id") references "fms_tracking_locations" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_tracking_milestones" drop constraint "fms_tracking_milestones_location_id_foreign";`);

    this.addSql(`alter table "fms_tracking_milestones" drop constraint "fms_tracking_milestones_webhook_event_reference_id_foreign";`);
  }

}
