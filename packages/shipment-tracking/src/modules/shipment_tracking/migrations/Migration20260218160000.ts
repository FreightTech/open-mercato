import { Migration } from '@mikro-orm/migrations'

/**
 * Add denormalized route_stops and cargo_events JSONB columns to shipments.
 * 
 * These columns store pre-computed route information and filtered cargo events
 * for each specific container, eliminating the need for extra API calls in the
 * shipment details drawer and fixing the data mixing bug.
 */
export class Migration20260218160000 extends Migration {
  override async up(): Promise<void> {
    // Add route_stops column - pre-computed route stops for this container
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments" 
      ADD COLUMN IF NOT EXISTS "route_stops" jsonb NULL;
    `)

    // Add cargo_events column - denormalized events filtered for this container
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments" 
      ADD COLUMN IF NOT EXISTS "cargo_events" jsonb NULL;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "shipment_tracking_shipments" DROP COLUMN IF EXISTS "route_stops";`)
    this.addSql(`ALTER TABLE "shipment_tracking_shipments" DROP COLUMN IF EXISTS "cargo_events";`)
  }
}
