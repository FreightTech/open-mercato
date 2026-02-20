import { Migration } from '@mikro-orm/migrations'

/**
 * Adds custom_name column to frc_consoles table.
 * When set, this overrides the auto-generated name ({Truck}/{Date}/{Route}).
 */
export class Migration20260219160000_console_custom_name extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "frc_consoles" add column "custom_name" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "frc_consoles" drop column "custom_name";`)
  }
}
