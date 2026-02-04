import { Migration } from '@mikro-orm/migrations';

export class Migration20260201224723 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column if not exists "carrier_id" uuid null;`);
    this.addSql(`
      do $$ begin
        alter table "fms_projects" add constraint "fms_projects_carrier_id_foreign" foreign key ("carrier_id") references "fms_carriers" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_projects') then
          alter table "fms_projects" drop constraint if exists "fms_projects_carrier_id_foreign";
        end if;
      end $$;
    `);
    this.addSql(`alter table "fms_projects" drop column if exists "carrier_id";`);
  }

}
