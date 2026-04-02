import { Migration } from '@mikro-orm/migrations';

export class Migration20260402100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_file_unit_legs" add column "dropoff_location_id" uuid null;`);
    this.addSql(`alter table "fms_file_unit_legs" add column "dropoff_time" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_file_unit_legs" drop column "dropoff_location_id";`);
    this.addSql(`alter table "fms_file_unit_legs" drop column "dropoff_time";`);
  }

}
