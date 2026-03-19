import { Migration } from '@mikro-orm/migrations';

export class Migration20260319094653 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_file_unit_legs" add column "ptd" text null, add column "etd" text null, add column "atd" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_file_unit_legs" drop column "ptd", drop column "etd", drop column "atd";`);
  }

}
