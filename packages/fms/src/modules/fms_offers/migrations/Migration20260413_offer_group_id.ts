import { Migration } from '@mikro-orm/migrations';

export class Migration20260413_offer_group_id extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column "group_id" uuid null;`);
    this.addSql(`create index "fms_offers_group_idx" on "fms_offers" ("group_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "fms_offers_group_idx";`);
    this.addSql(`alter table "fms_offers" drop column "group_id";`);
  }

}
