import { Migration } from '@mikro-orm/migrations';

export class Migration20260131194448 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "contractors" add column if not exists "official_name" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "contractors" drop column "official_name";`);
  }

}
