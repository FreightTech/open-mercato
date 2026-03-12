import { Migration } from '@mikro-orm/migrations'

/**
 * Fix the unique constraint on frc_sugarcrm_mappings to include local_entity_type
 *
 * The previous constraint only used (org_id, tenant_id, sugarcrm_module, sugarcrm_record_id)
 * which prevented one SugarCRM record from mapping to multiple local entities.
 *
 * For example, an ev_Quotes record creates both an FrcOffer AND an FrcProject when booked.
 * Both need separate mapping entries, which requires local_entity_type in the constraint.
 */
export class Migration20260223140000_fix_sugarcrm_mappings_unique extends Migration {
  override async up(): Promise<void> {
    // Drop the old unique constraint that doesn't include local_entity_type
    this.addSql(`
      ALTER TABLE "frc_sugarcrm_mappings"
      DROP CONSTRAINT IF EXISTS "frc_sugarcrm_mappings_unique";
    `)

    // Create new unique constraint that includes local_entity_type
    this.addSql(`
      ALTER TABLE "frc_sugarcrm_mappings"
      ADD CONSTRAINT "frc_sugarcrm_mappings_unique"
      UNIQUE ("organization_id", "tenant_id", "sugarcrm_module", "sugarcrm_record_id", "local_entity_type");
    `)
  }

  override async down(): Promise<void> {
    // Revert to the old constraint (this may fail if duplicate data exists)
    this.addSql(`
      ALTER TABLE "frc_sugarcrm_mappings"
      DROP CONSTRAINT IF EXISTS "frc_sugarcrm_mappings_unique";
    `)

    this.addSql(`
      ALTER TABLE "frc_sugarcrm_mappings"
      ADD CONSTRAINT "frc_sugarcrm_mappings_unique"
      UNIQUE ("organization_id", "tenant_id", "sugarcrm_module", "sugarcrm_record_id");
    `)
  }
}
