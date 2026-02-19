import { Migration } from '@mikro-orm/migrations';

/**
 * Add all DCSA T&T v3.0 fields to shipment_tracking_cargo_events table.
 * This enables full DCSA compliance for booking-level tracking with multiple containers.
 */
export class Migration20260216130000 extends Migration {

  override async up(): Promise<void> {
    // Equipment fields (DCSA EQUIPMENT events)
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "equipment_reference" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "iso_equipment_code" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "empty_indicator_code" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "is_transshipment_move" boolean null;`);

    // Location fields
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "facility_code" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "facility_code_list_provider" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "facility_type_code" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "latitude" real null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "longitude" real null;`);

    // Transport call fields
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "transport_call_reference" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "mode_of_transport" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "carrier_service_code" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "carrier_export_voyage_number" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "carrier_import_voyage_number" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "universal_service_reference" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "universal_export_voyage_reference" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "universal_import_voyage_reference" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "port_visit_reference" text null;`);

    // Document references (JSONB array)
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "related_document_references" jsonb null;`);

    // Metadata fields
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "event_created_date_time" timestamptz null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "retracted_event_id" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "publisher_name" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "publisher_role" text null;`);

    // Additional event fields
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "delay_reason_code" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "change_remark" text null;`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add column "seals" jsonb null;`);

    // Index for equipment_reference (critical for multi-container booking lookups)
    this.addSql(`create index "st_cargo_events_equipment_ref_idx" on "shipment_tracking_cargo_events" ("equipment_reference");`);
  }

  override async down(): Promise<void> {
    // Drop index
    this.addSql(`drop index if exists "st_cargo_events_equipment_ref_idx";`);

    // Drop all new columns
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "equipment_reference";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "iso_equipment_code";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "empty_indicator_code";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "is_transshipment_move";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "facility_code";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "facility_code_list_provider";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "facility_type_code";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "latitude";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "longitude";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "transport_call_reference";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "mode_of_transport";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "carrier_service_code";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "carrier_export_voyage_number";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "carrier_import_voyage_number";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "universal_service_reference";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "universal_export_voyage_reference";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "universal_import_voyage_reference";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "port_visit_reference";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "related_document_references";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "event_created_date_time";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "retracted_event_id";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "publisher_name";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "publisher_role";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "delay_reason_code";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "change_remark";`);
    this.addSql(`alter table "shipment_tracking_cargo_events" drop column "seals";`);
  }

}
