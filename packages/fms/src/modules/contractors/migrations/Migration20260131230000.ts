import { Migration } from '@mikro-orm/migrations';

export class Migration20260131230000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "contractors" add column if not exists "regon" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "contractors" drop column if exists "regon";`);
  }

}
