import { Migration } from '@mikro-orm/migrations';

export class Migration20260110161010 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_locations" drop constraint if exists "fms_locations_product_type_check";`);

    this.addSql(`alter table "fms_locations" drop constraint if exists "fms_locations_port_id_foreign";`);

    this.addSql(`alter table "fms_locations" add column if not exists "lat" double precision null, add column if not exists "lng" double precision null, add column if not exists "city" text null, add column if not exists "country" text null;`);
    this.addSql(`alter table "fms_locations" alter column "product_type" type text using ("product_type"::text);`);
    this.addSql(`alter index "fms_locations_product_type_index" rename to "fms_locations_type_idx";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_locations" drop column if exists "lat", drop column if exists "lng", drop column if exists "city", drop column if exists "country";`);

    this.addSql(`alter table "fms_locations" add constraint "fms_locations_product_type_check" check("product_type" in ('port', 'terminal'));`);
    this.addSql(`alter table "fms_locations" add constraint "fms_locations_port_id_foreign" foreign key ("port_id") references "fms_locations" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter index "fms_locations_type_idx" rename to "fms_locations_product_type_index";`);
  }

}
