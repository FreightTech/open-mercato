import { Migration } from '@mikro-orm/migrations';

export class Migration20260120151541 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "currency_fetch_configs" add column "timezone" text null default 'UTC';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "currency_fetch_configs" drop column "timezone";`);
  }

}
