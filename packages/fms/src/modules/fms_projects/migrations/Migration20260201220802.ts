import { Migration } from '@mikro-orm/migrations';

export class Migration20260201220802 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_sea_containers" add column if not exists "vgm_cutoff_date" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_sea_containers" drop column if exists "vgm_cutoff_date";`);
  }

}
