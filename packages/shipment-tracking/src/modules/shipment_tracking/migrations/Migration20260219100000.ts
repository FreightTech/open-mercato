import { Migration } from '@mikro-orm/migrations'

/**
 * Add facility_address column to tracking events.
 * 
 * This column stores the full address string from DCSA's otherFacility field,
 * enabling rich location display without additional API calls.
 */
export class Migration20260219100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "shipment_tracking_events" 
      ADD COLUMN IF NOT EXISTS "facility_address" text NULL;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "shipment_tracking_events" 
      DROP COLUMN IF EXISTS "facility_address";
    `)
  }
}
