import { Migration } from '@mikro-orm/migrations';

export class Migration20260110164447 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_locations" drop column if exists "quadrant";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_locations" add column if not exists "quadrant" text not null;`);
  }

}
