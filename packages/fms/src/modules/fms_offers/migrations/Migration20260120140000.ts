import { Migration } from '@mikro-orm/migrations';

export class Migration20260120140000 extends Migration {

  override async up(): Promise<void> {
    // Add modes column to fms_quotes to store transport modes (sea, air, road, rail, barge)
    this.addSql(`alter table "fms_quotes" add column if not exists "modes" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quotes" drop column if exists "modes";`);
  }

}
