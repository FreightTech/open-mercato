import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Add transport_modes column to fms_projects
 *
 * Stores an array of transport modes (sea, air, road) selected for the project
 */
export class Migration20260119200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column if not exists "transport_modes" jsonb null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_projects" drop column if exists "transport_modes";`)
  }
}
