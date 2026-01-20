import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Add transport_unit_count column to fms_projects
 *
 * Adds a simple count field for tracking the number of transport units
 * (containers, trucks, ULDs) in a project.
 */
export class Migration20260121000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fms_projects"
      add column if not exists "transport_unit_count" integer null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "fms_projects"
      drop column if exists "transport_unit_count";
    `)
  }
}
