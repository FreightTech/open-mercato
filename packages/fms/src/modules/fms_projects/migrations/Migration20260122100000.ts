import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Update transport_modes from 'truck' to 'ftl'
 *
 * Migrates existing 'truck' values in the transportModes JSONB array to 'ftl'.
 * This supports the split of the 'truck' mode into separate 'ftl' and 'ltl' modes.
 */
export class Migration20260122100000 extends Migration {
  override async up(): Promise<void> {
    // Update transportModes JSONB array: replace 'truck' with 'ftl'
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(
          CASE WHEN elem::text = '"truck"' THEN '"ftl"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(transport_modes) AS elem
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"truck"';
    `)
  }

  override async down(): Promise<void> {
    // Revert: replace 'ftl' back with 'truck'
    // Note: This doesn't restore 'ltl' values that may have been added after migration
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(
          CASE WHEN elem::text = '"ftl"' THEN '"truck"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(transport_modes) AS elem
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"ftl"';
    `)
  }
}
