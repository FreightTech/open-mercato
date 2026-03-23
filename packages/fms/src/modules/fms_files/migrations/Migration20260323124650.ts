import { Migration } from '@mikro-orm/migrations';

export class Migration20260323124650 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_file_legs" add column "tracking_job_id" uuid null;`);
    this.addSql(`create index "fms_file_legs_tracking_job_idx" on "fms_file_legs" ("tracking_job_id");`);

    this.addSql(`alter table "fms_file_units" add column "tracked_shipment_id" uuid null;`);
    this.addSql(`create index "fms_file_units_tracked_shipment_idx" on "fms_file_units" ("tracked_shipment_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "fms_file_legs_tracking_job_idx";`);
    this.addSql(`alter table "fms_file_legs" drop column "tracking_job_id";`);

    this.addSql(`drop index "fms_file_units_tracked_shipment_idx";`);
    this.addSql(`alter table "fms_file_units" drop column "tracked_shipment_id";`);
  }

}
