import { Migration } from '@mikro-orm/migrations';

export class Migration20260208182648 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "shipment_tracking_carrier_configs" drop constraint "st_carrier_configs_name_uniq";`);

    this.addSql(`alter table "shipment_tracking_carrier_configs" add column "company_name" text null;`);
    this.addSql(`alter table "shipment_tracking_carrier_configs" add constraint "st_carrier_configs_name_company_uniq" unique ("organization_id", "tenant_id", "carrier_name", "company_name");`);

    this.addSql(`alter table "shipment_tracking_shipments" add column "company_name" text null;`);
    this.addSql(`create index "st_shipments_company_name_idx" on "shipment_tracking_shipments" ("company_name");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "shipment_tracking_carrier_configs" drop constraint "st_carrier_configs_name_company_uniq";`);
    this.addSql(`alter table "shipment_tracking_carrier_configs" drop column "company_name";`);

    this.addSql(`alter table "shipment_tracking_carrier_configs" add constraint "st_carrier_configs_name_uniq" unique ("organization_id", "tenant_id", "carrier_name");`);

    this.addSql(`drop index "st_shipments_company_name_idx";`);
    this.addSql(`alter table "shipment_tracking_shipments" drop column "company_name";`);
  }

}
