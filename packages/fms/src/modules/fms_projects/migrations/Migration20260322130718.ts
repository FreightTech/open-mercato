import { Migration } from '@mikro-orm/migrations';

export class Migration20260322130718 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column if not exists "base_currency" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column "base_currency";`);
  }

}
