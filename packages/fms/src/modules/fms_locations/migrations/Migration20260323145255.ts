import { Migration } from '@mikro-orm/migrations';

export class Migration20260323145255 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_locations" add column "facility_codes" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_locations" drop column "facility_codes";`);
  }

}
