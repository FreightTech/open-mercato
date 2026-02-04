import { Migration } from '@mikro-orm/migrations';

export class Migration20260203091648 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column "place_of_loading_id" uuid null, add column "place_of_discharge_id" uuid null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_place_of_loading_id_foreign" foreign key ("place_of_loading_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_place_of_discharge_id_foreign" foreign key ("place_of_discharge_id") references "fms_locations" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_place_of_loading_id_foreign";`);
    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_place_of_discharge_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop column "place_of_loading_id", drop column "place_of_discharge_id";`);
  }

}
