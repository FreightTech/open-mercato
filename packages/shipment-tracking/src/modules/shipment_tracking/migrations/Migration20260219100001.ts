import { Migration } from '@mikro-orm/migrations'

/**
 * Add origin_location and destination_location JSONB columns to shipments.
 * 
 * These columns store rich location data including facility name, code,
 * address, coordinates, and operator. Data is sourced from DCSA events
 * and optionally enriched via BIC Facility API.
 * 
 * Structure:
 * {
 *   name: string,
 *   unlocode: string | null,
 *   countryCode: string | null,
 *   facilityCode: string | null,
 *   facilityCodeListProvider: 'BIC' | 'SMDG' | null,
 *   facilityTypeCode: string | null,
 *   address: string | null,
 *   coords: { latitude: number, longitude: number } | null,
 *   operatorName: string | null,
 *   source: 'dcsa' | 'bic' | 'manual'
 * }
 */
export class Migration20260219100001 extends Migration {
  override async up(): Promise<void> {
    // Add origin_location column
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments" 
      ADD COLUMN IF NOT EXISTS "origin_location" jsonb NULL;
    `)

    // Add destination_location column
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments" 
      ADD COLUMN IF NOT EXISTS "destination_location" jsonb NULL;
    `)

    // Backfill existing data from flat fields
    this.addSql(`
      UPDATE "shipment_tracking_shipments" SET
        origin_location = jsonb_build_object(
          'name', COALESCE(origin_name, origin_unlocode, 'Unknown'),
          'unlocode', origin_unlocode,
          'countryCode', origin_country,
          'facilityCode', NULL,
          'facilityCodeListProvider', NULL,
          'facilityTypeCode', NULL,
          'address', NULL,
          'coords', NULL,
          'operatorName', NULL,
          'source', 'dcsa'
        )
      WHERE origin_unlocode IS NOT NULL OR origin_name IS NOT NULL;
    `)

    this.addSql(`
      UPDATE "shipment_tracking_shipments" SET
        destination_location = jsonb_build_object(
          'name', COALESCE(destination_name, destination_unlocode, 'Unknown'),
          'unlocode', destination_unlocode,
          'countryCode', destination_country,
          'facilityCode', NULL,
          'facilityCodeListProvider', NULL,
          'facilityTypeCode', NULL,
          'address', NULL,
          'coords', NULL,
          'operatorName', NULL,
          'source', 'dcsa'
        )
      WHERE destination_unlocode IS NOT NULL OR destination_name IS NOT NULL;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments" 
      DROP COLUMN IF EXISTS "origin_location";
    `)
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments" 
      DROP COLUMN IF EXISTS "destination_location";
    `)
  }
}
