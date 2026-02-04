import { Migration } from '@mikro-orm/migrations';

export class Migration20260110181938 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_locations') then
          alter table "fms_locations" drop constraint if exists "fms_locations_unique";
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      do $$ begin
        alter table "fms_locations" add constraint "fms_locations_unique" unique ("organization_id", "tenant_id", "code");
      exception when others then null; end $$;
    `);
  }

}
