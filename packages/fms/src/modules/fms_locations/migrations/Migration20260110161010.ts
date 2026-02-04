import { Migration } from '@mikro-orm/migrations';

export class Migration20260110161010 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_locations') then
          alter table "fms_locations" drop constraint if exists "fms_locations_product_type_check";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_locations') then
          alter table "fms_locations" drop constraint if exists "fms_locations_port_id_foreign";
        end if;
      end $$;
    `);

    this.addSql(`alter table "fms_locations" add column if not exists "lat" double precision null, add column if not exists "lng" double precision null, add column if not exists "city" text null, add column if not exists "country" text null;`);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_locations' and column_name = 'product_type') then
          alter table "fms_locations" alter column "product_type" type text using ("product_type"::text);
        end if;
      end $$;
    `);
    this.addSql(`alter index "fms_locations_product_type_index" rename to "fms_locations_type_idx";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_locations" drop column if exists "lat", drop column if exists "lng", drop column if exists "city", drop column if exists "country";`);

    this.addSql(`
      do $$ begin
        alter table "fms_locations" add constraint "fms_locations_product_type_check" check("product_type" in ('port', 'terminal'));
      exception when others then null; end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_locations" add constraint "fms_locations_port_id_foreign" foreign key ("port_id") references "fms_locations" ("id") on update cascade on delete restrict;
      exception when others then null; end $$;
    `);
    this.addSql(`alter index "fms_locations_type_idx" rename to "fms_locations_product_type_index";`);
  }

}
