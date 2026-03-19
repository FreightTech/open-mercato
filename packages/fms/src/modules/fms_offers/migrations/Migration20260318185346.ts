import { Migration } from '@mikro-orm/migrations';

export class Migration20260318185346 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column "base_currency" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column "base_currency";`);
  }

}
