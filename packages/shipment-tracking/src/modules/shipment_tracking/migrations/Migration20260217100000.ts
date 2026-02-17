import { Migration } from '@mikro-orm/migrations'

/**
 * Add origin and destination UN/LOCODE to tracking jobs
 * 
 * These fields are optional and will be auto-inferred from tracking events if not provided:
 * - originUnlocode: Port where shipment originates (e.g., CRMOB)
 * - destinationUnlocode: Port where shipment is delivered (e.g., PLGDY)
 * 
 * These are used to determine when events occur at origin/destination
 * for status transitions (ARRIVED, DELIVERED, etc.)
 */
export class Migration20260217100000 extends Migration {
  override async up(): Promise<void> {
    // Add origin_unlocode and destination_unlocode columns to tracking jobs
    // These are nullable - will be auto-inferred from tracking events if not provided
    this.addSql(`
      ALTER TABLE "shipment_tracking_jobs"
      ADD COLUMN IF NOT EXISTS "origin_unlocode" varchar(5) NULL,
      ADD COLUMN IF NOT EXISTS "destination_unlocode" varchar(5) NULL;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "shipment_tracking_jobs"
      DROP COLUMN IF EXISTS "origin_unlocode",
      DROP COLUMN IF EXISTS "destination_unlocode";
    `)
  }
}
