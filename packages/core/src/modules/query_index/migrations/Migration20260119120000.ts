import { Migration } from '@mikro-orm/migrations';

/**
 * Migration: Add organization_id_coalesced generated column to entity_indexes
 *
 * This column is required for the ON CONFLICT clause in batch upserts.
 * It coalesces NULL organization_ids to a fixed UUID so unique constraints work properly
 * (since NULL values don't compare equal in PostgreSQL unique constraints).
 */
export class Migration20260119120000 extends Migration {

  override async up(): Promise<void> {
    // Add generated column that coalesces NULL to a fixed UUID
    this.addSql(`
      alter table "entity_indexes"
      add column if not exists "organization_id_coalesced" uuid
      generated always as (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;
    `);

    // Create unique index for upsert conflict detection
    this.addSql(`
      create unique index if not exists "entity_indexes_upsert_idx"
      on "entity_indexes" ("entity_type", "entity_id", "organization_id_coalesced");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "entity_indexes_upsert_idx";`);
    this.addSql(`alter table "entity_indexes" drop column if exists "organization_id_coalesced";`);
  }
}
