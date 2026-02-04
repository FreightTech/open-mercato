import { Migration } from '@mikro-orm/migrations';

export class Migration20260127181437 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column "booking_number" text null, add column "operator_id" uuid null, add column "operator_name" text null, add column "sales_person_id" uuid null, add column "sales_person_name" text null, add column "shipper_id" uuid null, add column "consignee_id" uuid null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_shipper_id_foreign" foreign key ("shipper_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_consignee_id_foreign" foreign key ("consignee_id") references "contractors" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_shipper_id_foreign";`);
    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_consignee_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop column "booking_number", drop column "operator_id", drop column "operator_name", drop column "sales_person_id", drop column "sales_person_name", drop column "shipper_id", drop column "consignee_id";`);
  }

}
