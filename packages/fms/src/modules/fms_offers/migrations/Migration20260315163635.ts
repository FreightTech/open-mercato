import { Migration } from '@mikro-orm/migrations';

export class Migration20260315163635 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column "type" text not null default 'sell', add column "carrier_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column "type", drop column "carrier_id";`);
  }

}
