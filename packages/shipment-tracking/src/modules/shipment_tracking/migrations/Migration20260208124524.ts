import { Migration } from '@mikro-orm/migrations';

export class Migration20260208124524 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "shipment_tracking_carrier_configs" add column "deleted_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "shipment_tracking_carrier_configs" drop column "deleted_at";`);
  }

}
