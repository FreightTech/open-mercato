import { Migration } from '@mikro-orm/migrations';

export class Migration20260210133102 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "shipment_tracking_jobs" add column "deleted_at" timestamptz null;`);

    this.addSql(`alter table "shipment_tracking_webhooks" add column "deleted_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "shipment_tracking_jobs" drop column "deleted_at";`);

    this.addSql(`alter table "shipment_tracking_webhooks" drop column "deleted_at";`);
  }

}
