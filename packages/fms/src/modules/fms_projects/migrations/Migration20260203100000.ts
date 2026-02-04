import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Update transport_modes to align with fms_quotes module
 *
 * Migrates existing transport mode values to the unified format:
 * - 'ship' -> 'sea'
 * - 'ftl' -> 'road'
 * - 'ltl' -> 'road'
 * - 'train' -> 'rail'
 *
 * The fms_quotes module uses ['sea', 'air', 'road', 'rail', 'barge']
 * The fms_projects module was using ['ftl', 'ltl', 'ship', 'train', 'air', 'barge']
 */
export class Migration20260203100000 extends Migration {
  override async up(): Promise<void> {
    // Replace 'ship' with 'sea'
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(
          CASE WHEN elem::text = '"ship"' THEN '"sea"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(transport_modes) AS elem
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"ship"';
    `)

    // Replace 'ftl' with 'road'
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(
          CASE WHEN elem::text = '"ftl"' THEN '"road"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(transport_modes) AS elem
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"ftl"';
    `)

    // Replace 'ltl' with 'road' (and deduplicate if both ftl and ltl existed)
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(DISTINCT elem)
        FROM (
          SELECT CASE WHEN elem::text = '"ltl"' THEN '"road"'::jsonb ELSE elem END AS elem
          FROM jsonb_array_elements(transport_modes) AS elem
        ) sub
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"ltl"';
    `)

    // Replace 'train' with 'rail'
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(
          CASE WHEN elem::text = '"train"' THEN '"rail"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(transport_modes) AS elem
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"train"';
    `)
  }

  override async down(): Promise<void> {
    // Revert: replace 'sea' back with 'ship'
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(
          CASE WHEN elem::text = '"sea"' THEN '"ship"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(transport_modes) AS elem
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"sea"';
    `)

    // Revert: replace 'road' back with 'ftl'
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(
          CASE WHEN elem::text = '"road"' THEN '"ftl"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(transport_modes) AS elem
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"road"';
    `)

    // Revert: replace 'rail' back with 'train'
    this.addSql(`
      UPDATE fms_projects
      SET transport_modes = (
        SELECT jsonb_agg(
          CASE WHEN elem::text = '"rail"' THEN '"train"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(transport_modes) AS elem
      )
      WHERE transport_modes IS NOT NULL
        AND transport_modes @> '"rail"';
    `)
  }
}
