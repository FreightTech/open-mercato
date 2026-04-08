import { Migration } from '@mikro-orm/migrations';

export class Migration20260407_offer_label extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column "offer_label" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column "offer_label";`);
  }

}
