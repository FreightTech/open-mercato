import { Migration } from '@mikro-orm/migrations'

/**
 * Add SugarCRM integration support
 *
 * Note: Credentials are stored in environment variables, not in the database.
 * - SUGARCRM_INSTANCE_URL, SUGARCRM_USERNAME, SUGARCRM_PASSWORD
 *
 * This migration:
 * - Removes credential columns from frc_sugarcrm_config (if they exist from prior migrations)
 * - Creates frc_sugarcrm_mappings for tracking synced records (ID mappings only)
 */
export class Migration20260220100000_sugarcrm_integration extends Migration {
  override async up(): Promise<void> {
    // Remove credential columns from frc_sugarcrm_config if they exist
    // (credentials are now stored in environment variables)
    this.addSql(`
      ALTER TABLE "frc_sugarcrm_config"
      DROP COLUMN IF EXISTS "instance_url",
      DROP COLUMN IF EXISTS "api_key",
      DROP COLUMN IF EXISTS "username",
      DROP COLUMN IF EXISTS "password",
      DROP COLUMN IF EXISTS "platform",
      DROP COLUMN IF EXISTS "sync_modules";
    `)

    // Create frc_sugarcrm_mappings table (simplified - just ID mappings)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "frc_sugarcrm_mappings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "sugarcrm_module" text NOT NULL,
        "sugarcrm_record_id" text NOT NULL,
        "local_entity_type" text NOT NULL,
        "local_entity_id" uuid NOT NULL,
        "last_sync_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "frc_sugarcrm_mappings_pkey" PRIMARY KEY ("id")
      );
    `)

    // Create indexes
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "frc_sugarcrm_mappings_org_tenant_idx"
      ON "frc_sugarcrm_mappings" ("organization_id", "tenant_id");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "frc_sugarcrm_mappings_sugar_idx"
      ON "frc_sugarcrm_mappings" ("sugarcrm_module", "sugarcrm_record_id");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "frc_sugarcrm_mappings_local_idx"
      ON "frc_sugarcrm_mappings" ("local_entity_type", "local_entity_id");
    `)

    // Create unique constraint
    this.addSql(`
      ALTER TABLE "frc_sugarcrm_mappings"
      ADD CONSTRAINT "frc_sugarcrm_mappings_unique"
      UNIQUE ("organization_id", "tenant_id", "sugarcrm_module", "sugarcrm_record_id");
    `)

    // Drop old table if it exists (from prior development)
    this.addSql(`DROP TABLE IF EXISTS "frc_sugarcrm_sync_records";`)
  }

  override async down(): Promise<void> {
    // Drop mappings table
    this.addSql(`DROP TABLE IF EXISTS "frc_sugarcrm_mappings";`)

    // Restore credential columns to frc_sugarcrm_config
    this.addSql(`
      ALTER TABLE "frc_sugarcrm_config"
      ADD COLUMN IF NOT EXISTS "instance_url" text NULL,
      ADD COLUMN IF NOT EXISTS "api_key" text NULL,
      ADD COLUMN IF NOT EXISTS "username" text NULL,
      ADD COLUMN IF NOT EXISTS "password" text NULL,
      ADD COLUMN IF NOT EXISTS "platform" text DEFAULT '4rcargo',
      ADD COLUMN IF NOT EXISTS "sync_modules" jsonb NULL;
    `)
  }
}
