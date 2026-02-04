import { Migration } from '@mikro-orm/migrations';

export class Migration20260203091648 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column if not exists "place_of_loading_id" uuid null, add column if not exists "place_of_discharge_id" uuid null;`);
    this.addSql(`
      do $$ begin
        alter table "fms_projects" add constraint "fms_projects_place_of_loading_id_foreign" foreign key ("place_of_loading_id") references "fms_locations" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_projects" add constraint "fms_projects_place_of_discharge_id_foreign" foreign key ("place_of_discharge_id") references "fms_locations" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_projects') then
          alter table "fms_projects" drop constraint if exists "fms_projects_place_of_loading_id_foreign";
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_projects') then
          alter table "fms_projects" drop constraint if exists "fms_projects_place_of_discharge_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`alter table "fms_projects" drop column if exists "place_of_loading_id", drop column if exists "place_of_discharge_id";`);
  }

}
