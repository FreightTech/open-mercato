import { Migration } from '@mikro-orm/migrations';

export class Migration20260201224723 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column "carrier_id" uuid null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_carrier_id_foreign" foreign key ("carrier_id") references "fms_carriers" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_carrier_id_foreign";`);
    this.addSql(`alter table "fms_projects" drop column "carrier_id";`);
  }

}
