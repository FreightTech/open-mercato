import { Migration } from '@mikro-orm/migrations';

export class Migration20260326100000 extends Migration {

  override async up(): Promise<void> {
    // Make origin/destination location nullable on fms_file_legs
    // Allows legs to be created without locations (tracking sync fills them in)
    this.addSql(`alter table "fms_file_legs" alter column "origin_location_id" drop not null;`);
    this.addSql(`alter table "fms_file_legs" alter column "destination_location_id" drop not null;`);

    // Make origin/destination location nullable on fms_file_units
    // Allows units auto-created by tracking to inherit locations later
    this.addSql(`alter table "fms_file_units" alter column "origin_location_id" drop not null;`);
    this.addSql(`alter table "fms_file_units" alter column "destination_location_id" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_file_legs" alter column "origin_location_id" set not null;`);
    this.addSql(`alter table "fms_file_legs" alter column "destination_location_id" set not null;`);
    this.addSql(`alter table "fms_file_units" alter column "origin_location_id" set not null;`);
    this.addSql(`alter table "fms_file_units" alter column "destination_location_id" set not null;`);
  }

}
