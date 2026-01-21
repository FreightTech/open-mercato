import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Add shipments module fields to transport units
 *
 * Adds new fields required for the shipments aggregate view:
 * - FmsSeaContainer: VGM, customs, import/rail/export specific fields
 * - FmsAirUnit: customs clearance fields
 * - FmsRoadUnit: unloading, weighing, rate, customs fields
 */
export class Migration20260122000000 extends Migration {
  override async up(): Promise<void> {
    // FmsSeaContainer: VGM fields
    this.addSql(`
      alter table "fms_sea_containers"
      add column if not exists "vgm_status" varchar(50) null,
      add column if not exists "vgm_weight" numeric(12,3) null;
    `)

    // FmsSeaContainer: Customs fields
    this.addSql(`
      alter table "fms_sea_containers"
      add column if not exists "customs_clearance_status" varchar(50) null,
      add column if not exists "customs_clearance_location" text null;
    `)

    // FmsSeaContainer: Import-specific fields
    this.addSql(`
      alter table "fms_sea_containers"
      add column if not exists "pin_code" varchar(50) null,
      add column if not exists "delivery_time" varchar(20) null;
    `)

    // FmsSeaContainer: Rail-specific fields
    this.addSql(`
      alter table "fms_sea_containers"
      add column if not exists "drop_off_location" text null;
    `)

    // FmsSeaContainer: Export-specific fields
    this.addSql(`
      alter table "fms_sea_containers"
      add column if not exists "cut_off_date" timestamptz null;
    `)

    // FmsAirUnit: Customs fields
    this.addSql(`
      alter table "fms_air_units"
      add column if not exists "customs_clearance_status" varchar(50) null,
      add column if not exists "customs_clearance_location" text null;
    `)

    // FmsRoadUnit: Unloading and weighing fields
    this.addSql(`
      alter table "fms_road_units"
      add column if not exists "unloading_notes" text null,
      add column if not exists "weighing_status" varchar(50) null;
    `)

    // FmsRoadUnit: Rate with currency
    this.addSql(`
      alter table "fms_road_units"
      add column if not exists "rate" numeric(18,4) null,
      add column if not exists "rate_currency" varchar(10) default 'PLN';
    `)

    // FmsRoadUnit: Customs status
    this.addSql(`
      alter table "fms_road_units"
      add column if not exists "customs_status" varchar(100) null;
    `)
  }

  override async down(): Promise<void> {
    // FmsSeaContainer: Remove VGM fields
    this.addSql(`
      alter table "fms_sea_containers"
      drop column if exists "vgm_status",
      drop column if exists "vgm_weight";
    `)

    // FmsSeaContainer: Remove customs fields
    this.addSql(`
      alter table "fms_sea_containers"
      drop column if exists "customs_clearance_status",
      drop column if exists "customs_clearance_location";
    `)

    // FmsSeaContainer: Remove import-specific fields
    this.addSql(`
      alter table "fms_sea_containers"
      drop column if exists "pin_code",
      drop column if exists "delivery_time";
    `)

    // FmsSeaContainer: Remove rail-specific fields
    this.addSql(`
      alter table "fms_sea_containers"
      drop column if exists "drop_off_location";
    `)

    // FmsSeaContainer: Remove export-specific fields
    this.addSql(`
      alter table "fms_sea_containers"
      drop column if exists "cut_off_date";
    `)

    // FmsAirUnit: Remove customs fields
    this.addSql(`
      alter table "fms_air_units"
      drop column if exists "customs_clearance_status",
      drop column if exists "customs_clearance_location";
    `)

    // FmsRoadUnit: Remove unloading and weighing fields
    this.addSql(`
      alter table "fms_road_units"
      drop column if exists "unloading_notes",
      drop column if exists "weighing_status";
    `)

    // FmsRoadUnit: Remove rate fields
    this.addSql(`
      alter table "fms_road_units"
      drop column if exists "rate",
      drop column if exists "rate_currency";
    `)

    // FmsRoadUnit: Remove customs status
    this.addSql(`
      alter table "fms_road_units"
      drop column if exists "customs_status";
    `)
  }
}
