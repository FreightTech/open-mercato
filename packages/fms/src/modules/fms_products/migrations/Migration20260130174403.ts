import { Migration } from '@mikro-orm/migrations';

export class Migration20260130174403 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_product_variants') then
          alter table "fms_product_variants" drop constraint if exists "fms_product_variants_price_type_id_foreign";
        end if;
      end $$;
    `);
    this.addSql(`alter table "fms_product_variants" drop column if exists "price_type_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_product_variants" add column if not exists "price_type_id" uuid null;`);
    this.addSql(`
      do $$ begin
        alter table "fms_product_variants" add constraint "fms_product_variants_price_type_id_foreign" foreign key ("price_type_id") references "fms_price_types" ("id") on update cascade on delete set null;
      exception when others then null; end $$;
    `);
  }

}
