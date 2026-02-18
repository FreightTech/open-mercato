import { Migration } from '@mikro-orm/migrations'

/**
 * Multi-source timestamps migration
 *
 * Changes:
 * 1. Add JSONB columns for multi-source timestamps: etd_timestamps, eta_timestamps, atd_timestamps, ata_timestamps
 * 2. Migrate existing single timestamp values to JSONB arrays
 * 3. Remove old single timestamp columns: etd, etd_offset, eta, eta_offset, atd, atd_offset, ata, ata_offset
 * 4. Remove current_location columns (derived from latest event): current_location_name, current_location_unlocode
 */
export class Migration20260218150000 extends Migration {
  override async up(): Promise<void> {
    // ─── Step 1: Add new JSONB timestamp columns ──────────────────────
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments"
      ADD COLUMN IF NOT EXISTS "etd_timestamps" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "eta_timestamps" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "atd_timestamps" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "ata_timestamps" jsonb NULL;
    `)

    // ─── Step 2: Migrate existing timestamp data to JSONB arrays ──────
    // ETD migration
    this.addSql(`
      UPDATE "shipment_tracking_shipments"
      SET "etd_timestamps" = jsonb_build_array(
        jsonb_build_object(
          'value', to_char("etd" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'offset', COALESCE("etd_offset", 'Z'),
          'source', 'carrier_api',
          'updatedAt', to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'sourceEventId', NULL
        )
      )
      WHERE "etd" IS NOT NULL AND "etd_timestamps" IS NULL;
    `)

    // ETA migration
    this.addSql(`
      UPDATE "shipment_tracking_shipments"
      SET "eta_timestamps" = jsonb_build_array(
        jsonb_build_object(
          'value', to_char("eta" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'offset', COALESCE("eta_offset", 'Z'),
          'source', 'carrier_api',
          'updatedAt', to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'sourceEventId', NULL
        )
      )
      WHERE "eta" IS NOT NULL AND "eta_timestamps" IS NULL;
    `)

    // ATD migration
    this.addSql(`
      UPDATE "shipment_tracking_shipments"
      SET "atd_timestamps" = jsonb_build_array(
        jsonb_build_object(
          'value', to_char("atd" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'offset', COALESCE("atd_offset", 'Z'),
          'source', 'carrier_api',
          'updatedAt', to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'sourceEventId', NULL
        )
      )
      WHERE "atd" IS NOT NULL AND "atd_timestamps" IS NULL;
    `)

    // ATA migration
    this.addSql(`
      UPDATE "shipment_tracking_shipments"
      SET "ata_timestamps" = jsonb_build_array(
        jsonb_build_object(
          'value', to_char("ata" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'offset', COALESCE("ata_offset", 'Z'),
          'source', 'carrier_api',
          'updatedAt', to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'sourceEventId', NULL
        )
      )
      WHERE "ata" IS NOT NULL AND "ata_timestamps" IS NULL;
    `)

    // ─── Step 3: Drop old columns ─────────────────────────────────────
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments"
      DROP COLUMN IF EXISTS "etd",
      DROP COLUMN IF EXISTS "etd_offset",
      DROP COLUMN IF EXISTS "eta",
      DROP COLUMN IF EXISTS "eta_offset",
      DROP COLUMN IF EXISTS "atd",
      DROP COLUMN IF EXISTS "atd_offset",
      DROP COLUMN IF EXISTS "ata",
      DROP COLUMN IF EXISTS "ata_offset",
      DROP COLUMN IF EXISTS "current_location_name",
      DROP COLUMN IF EXISTS "current_location_unlocode";
    `)
  }

  override async down(): Promise<void> {
    // ─── Step 1: Re-add old columns ───────────────────────────────────
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments"
      ADD COLUMN IF NOT EXISTS "etd" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "etd_offset" text NULL,
      ADD COLUMN IF NOT EXISTS "eta" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "eta_offset" text NULL,
      ADD COLUMN IF NOT EXISTS "atd" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "atd_offset" text NULL,
      ADD COLUMN IF NOT EXISTS "ata" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "ata_offset" text NULL,
      ADD COLUMN IF NOT EXISTS "current_location_name" text NULL,
      ADD COLUMN IF NOT EXISTS "current_location_unlocode" text NULL;
    `)

    // ─── Step 2: Migrate data back from JSONB arrays ──────────────────
    // Extract latest (by updatedAt) entry from each JSONB array
    this.addSql(`
      UPDATE "shipment_tracking_shipments" s
      SET 
        "etd" = (
          SELECT (entry->>'value')::timestamptz
          FROM jsonb_array_elements(s."etd_timestamps") AS entry
          ORDER BY entry->>'updatedAt' DESC
          LIMIT 1
        ),
        "etd_offset" = (
          SELECT entry->>'offset'
          FROM jsonb_array_elements(s."etd_timestamps") AS entry
          ORDER BY entry->>'updatedAt' DESC
          LIMIT 1
        )
      WHERE s."etd_timestamps" IS NOT NULL AND jsonb_array_length(s."etd_timestamps") > 0;
    `)

    this.addSql(`
      UPDATE "shipment_tracking_shipments" s
      SET 
        "eta" = (
          SELECT (entry->>'value')::timestamptz
          FROM jsonb_array_elements(s."eta_timestamps") AS entry
          ORDER BY entry->>'updatedAt' DESC
          LIMIT 1
        ),
        "eta_offset" = (
          SELECT entry->>'offset'
          FROM jsonb_array_elements(s."eta_timestamps") AS entry
          ORDER BY entry->>'updatedAt' DESC
          LIMIT 1
        )
      WHERE s."eta_timestamps" IS NOT NULL AND jsonb_array_length(s."eta_timestamps") > 0;
    `)

    this.addSql(`
      UPDATE "shipment_tracking_shipments" s
      SET 
        "atd" = (
          SELECT (entry->>'value')::timestamptz
          FROM jsonb_array_elements(s."atd_timestamps") AS entry
          ORDER BY entry->>'updatedAt' DESC
          LIMIT 1
        ),
        "atd_offset" = (
          SELECT entry->>'offset'
          FROM jsonb_array_elements(s."atd_timestamps") AS entry
          ORDER BY entry->>'updatedAt' DESC
          LIMIT 1
        )
      WHERE s."atd_timestamps" IS NOT NULL AND jsonb_array_length(s."atd_timestamps") > 0;
    `)

    this.addSql(`
      UPDATE "shipment_tracking_shipments" s
      SET 
        "ata" = (
          SELECT (entry->>'value')::timestamptz
          FROM jsonb_array_elements(s."ata_timestamps") AS entry
          ORDER BY entry->>'updatedAt' DESC
          LIMIT 1
        ),
        "ata_offset" = (
          SELECT entry->>'offset'
          FROM jsonb_array_elements(s."ata_timestamps") AS entry
          ORDER BY entry->>'updatedAt' DESC
          LIMIT 1
        )
      WHERE s."ata_timestamps" IS NOT NULL AND jsonb_array_length(s."ata_timestamps") > 0;
    `)

    // ─── Step 3: Drop JSONB columns ───────────────────────────────────
    this.addSql(`
      ALTER TABLE "shipment_tracking_shipments"
      DROP COLUMN IF EXISTS "etd_timestamps",
      DROP COLUMN IF EXISTS "eta_timestamps",
      DROP COLUMN IF EXISTS "atd_timestamps",
      DROP COLUMN IF EXISTS "ata_timestamps";
    `)
  }
}
