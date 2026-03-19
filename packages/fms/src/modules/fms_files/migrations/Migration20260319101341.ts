import { Migration } from '@mikro-orm/migrations';

export class Migration20260319101341 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_file_unit_legs" add column "pta" text null, add column "eta" text null, add column "ata" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_file_unit_legs" drop column "pta", drop column "eta", drop column "ata";`);
  }

}
