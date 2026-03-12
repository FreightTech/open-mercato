import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Remove flat location fields from shipments table
 * 
 * The flat fields (origin_name, origin_unlocode, origin_country, destination_*)
 * are replaced by the JSONB fields (origin_location, destination_location).
 * 
 * Previous migration (Migration20260219100001) already backfilled the JSONB fields
 * from flat fields, so this migration just drops the redundant columns.
 */
export class Migration20260219100002 extends Migration {
  async up(): Promise<void> {
    // Drop flat origin location columns
    this.addSql('ALTER TABLE "shipment_tracking_shipments" DROP COLUMN IF EXISTS "origin_name"')
    this.addSql('ALTER TABLE "shipment_tracking_shipments" DROP COLUMN IF EXISTS "origin_unlocode"')
    this.addSql('ALTER TABLE "shipment_tracking_shipments" DROP COLUMN IF EXISTS "origin_country"')

    // Drop flat destination location columns
    this.addSql('ALTER TABLE "shipment_tracking_shipments" DROP COLUMN IF EXISTS "destination_name"')
    this.addSql('ALTER TABLE "shipment_tracking_shipments" DROP COLUMN IF EXISTS "destination_unlocode"')
    this.addSql('ALTER TABLE "shipment_tracking_shipments" DROP COLUMN IF EXISTS "destination_country"')
  }

  async down(): Promise<void> {
    // Re-add flat origin columns
    this.addSql('ALTER TABLE "shipment_tracking_shipments" ADD COLUMN IF NOT EXISTS "origin_name" text')
    this.addSql('ALTER TABLE "shipment_tracking_shipments" ADD COLUMN IF NOT EXISTS "origin_unlocode" text')
    this.addSql('ALTER TABLE "shipment_tracking_shipments" ADD COLUMN IF NOT EXISTS "origin_country" text')

    // Re-add flat destination columns
    this.addSql('ALTER TABLE "shipment_tracking_shipments" ADD COLUMN IF NOT EXISTS "destination_name" text')
    this.addSql('ALTER TABLE "shipment_tracking_shipments" ADD COLUMN IF NOT EXISTS "destination_unlocode" text')
    this.addSql('ALTER TABLE "shipment_tracking_shipments" ADD COLUMN IF NOT EXISTS "destination_country" text')

    // Populate flat fields from JSONB
    this.addSql(`
      UPDATE "shipment_tracking_shipments" SET
        origin_name = origin_location->>'name',
        origin_unlocode = origin_location->>'unlocode',
        origin_country = origin_location->>'countryCode'
      WHERE origin_location IS NOT NULL
    `)

    this.addSql(`
      UPDATE "shipment_tracking_shipments" SET
        destination_name = destination_location->>'name',
        destination_unlocode = destination_location->>'unlocode',
        destination_country = destination_location->>'countryCode'
      WHERE destination_location IS NOT NULL
    `)
  }
}
