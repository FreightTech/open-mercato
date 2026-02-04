import { Migration } from '@mikro-orm/migrations';

export class Migration20260127181437 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_projects" add column if not exists "booking_number" text null, add column if not exists "operator_id" uuid null, add column if not exists "operator_name" text null, add column if not exists "sales_person_id" uuid null, add column if not exists "sales_person_name" text null, add column if not exists "shipper_id" uuid null, add column if not exists "consignee_id" uuid null;`);
    this.addSql(`
      do $$ begin
        alter table "fms_projects" add constraint "fms_projects_shipper_id_foreign" foreign key ("shipper_id") references "contractors" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_projects" add constraint "fms_projects_consignee_id_foreign" foreign key ("consignee_id") references "contractors" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_projects') then
          alter table "fms_projects" drop constraint if exists "fms_projects_shipper_id_foreign";
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_projects') then
          alter table "fms_projects" drop constraint if exists "fms_projects_consignee_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`alter table "fms_projects" drop column if exists "booking_number", drop column if exists "operator_id", drop column if exists "operator_name", drop column if exists "sales_person_id", drop column if exists "sales_person_name", drop column if exists "shipper_id", drop column if exists "consignee_id";`);
  }

}
