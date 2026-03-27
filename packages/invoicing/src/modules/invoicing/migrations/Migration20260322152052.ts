import { Migration } from '@mikro-orm/migrations';

export class Migration20260322152052 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "invoicing_settings" add column "default_seller_name" text null, add column "default_seller_address" text null, add column "default_seller_country_code" text null, add column "default_seller_bank_account" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "invoicing_settings" drop column "default_seller_name", drop column "default_seller_address", drop column "default_seller_country_code", drop column "default_seller_bank_account";`);
  }

}
