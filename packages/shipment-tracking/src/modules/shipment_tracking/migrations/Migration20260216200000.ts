import { Migration } from '@mikro-orm/migrations'

/**
 * Multi-container booking support migration
 * 
 * Major changes:
 * 1. Rename cargo_events table to tracking_events
 * 2. Change TrackingJob -> Shipment relationship (O2M instead of M2O)
 * 3. Change TrackingEvent ownership from Shipment to TrackingJob
 * 4. Add source and sourceEventId fields to events
 * 5. Add new fields to Shipment entity
 * 6. Rename carrierName to carrierCode
 */
export class Migration20260216200000 extends Migration {
  override async up(): Promise<void> {
    // ─── Step 1: Rename cargo_events table to tracking_events ─────────────
    this.addSql(`ALTER TABLE "shipment_tracking_cargo_events" RENAME TO "shipment_tracking_events";`)

    // Drop old indexes
    this.addSql(`DROP INDEX IF EXISTS "st_cargo_events_org_tenant_idx";`)
    this.addSql(`DROP INDEX IF EXISTS "st_cargo_events_shipment_idx";`)
    this.addSql(`DROP INDEX IF EXISTS "st_cargo_events_equipment_ref_idx";`)
    this.addSql(`ALTER TABLE "shipment_tracking_events" DROP CONSTRAINT IF EXISTS "st_cargo_events_event_id_uniq";`)

    // ─── Step 2: Update shipment_tracking_jobs table ──────────────────────
    // Rename carrier_name to carrier_code
    this.addSql(`ALTER TABLE "shipment_tracking_jobs" RENAME COLUMN "carrier_name" TO "carrier_code";`)
    
    // Drop the old shipment_id FK from tracking_jobs
    this.addSql(`ALTER TABLE "shipment_tracking_jobs" DROP CONSTRAINT IF EXISTS "shipment_tracking_jobs_shipment_id_foreign";`)
    this.addSql(`ALTER TABLE "shipment_tracking_jobs" DROP COLUMN IF EXISTS "shipment_id";`)

    // ─── Step 3: Update shipment_tracking_shipments table ─────────────────
    // Add tracking_job_id FK (nullable)
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments" 
      ADD COLUMN IF NOT EXISTS "tracking_job_id" uuid NULL REFERENCES "shipment_tracking_jobs"("id") ON DELETE SET NULL;
    `)

    // Add new columns for current location
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments" 
      ADD COLUMN IF NOT EXISTS "current_location_name" text NULL,
      ADD COLUMN IF NOT EXISTS "current_location_unlocode" text NULL,
      ADD COLUMN IF NOT EXISTS "voyage_number" text NULL,
      ADD COLUMN IF NOT EXISTS "last_event_at" timestamptz NULL;
    `)

    // Add index on tracking_job_id
    this.addSql(`CREATE INDEX IF NOT EXISTS "st_shipments_tracking_job_idx" ON "shipment_tracking_shipments" ("tracking_job_id");`)

    // ─── Step 4: Update shipment_tracking_events table ────────────────────
    // Add tracking_job_id column
    this.addSql(`
      ALTER TABLE "shipment_tracking_events" 
      ADD COLUMN IF NOT EXISTS "tracking_job_id" uuid NULL REFERENCES "shipment_tracking_jobs"("id") ON DELETE CASCADE;
    `)

    // Add source columns
    this.addSql(`
      ALTER TABLE "shipment_tracking_events"
      ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'dcsa',
      ADD COLUMN IF NOT EXISTS "source_event_id" text NULL;
    `)

    // Migrate event_id to source_event_id for existing rows
    this.addSql(`
      UPDATE "shipment_tracking_events" 
      SET "source_event_id" = "event_id" 
      WHERE "source_event_id" IS NULL AND "event_id" IS NOT NULL;
    `)

    // Rename event_classification to event_classifier_code
    this.addSql(`
      ALTER TABLE "shipment_tracking_events" 
      RENAME COLUMN "event_classification" TO "event_classifier_code";
    `)

    // Drop the old event_id column and shipment_id FK
    this.addSql(`ALTER TABLE "shipment_tracking_events" DROP COLUMN IF EXISTS "event_id";`)
    this.addSql(`ALTER TABLE "shipment_tracking_events" DROP CONSTRAINT IF EXISTS "shipment_tracking_cargo_events_shipment_id_foreign";`)
    this.addSql(`ALTER TABLE "shipment_tracking_events" DROP COLUMN IF EXISTS "shipment_id";`)

    // Create new indexes
    this.addSql(`CREATE INDEX IF NOT EXISTS "st_events_org_tenant_idx" ON "shipment_tracking_events" ("organization_id", "tenant_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "st_events_tracking_job_idx" ON "shipment_tracking_events" ("tracking_job_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "st_events_equipment_ref_idx" ON "shipment_tracking_events" ("equipment_reference");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "st_events_event_date_time_idx" ON "shipment_tracking_events" ("event_date_time");`)

    // Create unique constraint on source + sourceEventId per job
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "st_events_source_event_uniq" 
      ON "shipment_tracking_events" ("tracking_job_id", "source", "source_event_id") 
      WHERE "source_event_id" IS NOT NULL;
    `)

    // Make tracking_job_id NOT NULL after migration
    this.addSql(`ALTER TABLE "shipment_tracking_events" ALTER COLUMN "tracking_job_id" SET NOT NULL;`)

    // ─── Step 5: Update carrier_configs table ─────────────────────────────
    // Rename carrier_name to carrier_code
    this.addSql(`ALTER TABLE "shipment_tracking_carrier_configs" RENAME COLUMN "carrier_name" TO "carrier_code";`)
    
    // Update unique constraint
    this.addSql(`ALTER TABLE "shipment_tracking_carrier_configs" DROP CONSTRAINT IF EXISTS "st_carrier_configs_name_uniq";`)
    this.addSql(`
      ALTER TABLE "shipment_tracking_carrier_configs" 
      ADD CONSTRAINT "st_carrier_configs_code_uniq" 
      UNIQUE ("organization_id", "tenant_id", "carrier_code");
    `)
  }

  override async down(): Promise<void> {
    // Revert table rename
    this.addSql(`ALTER TABLE "shipment_tracking_events" RENAME TO "shipment_tracking_cargo_events";`)

    // Revert column renames
    this.addSql(`ALTER TABLE "shipment_tracking_jobs" RENAME COLUMN "carrier_code" TO "carrier_name";`)
    this.addSql(`ALTER TABLE "shipment_tracking_cargo_events" RENAME COLUMN "event_classifier_code" TO "event_classification";`)
    this.addSql(`ALTER TABLE "shipment_tracking_carrier_configs" RENAME COLUMN "carrier_code" TO "carrier_name";`)

    // Note: Full down migration would require rebuilding the old schema
    // This is a destructive migration, data may be lost on rollback
  }
}
