import { Migration } from '@mikro-orm/migrations';

export class Migration20260130174403 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_product_variants" drop constraint if exists "fms_product_variants_price_type_id_foreign";`);
    this.addSql(`alter table "fms_product_variants" drop column if exists "price_type_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_product_variants" add column "price_type_id" uuid null;`);
    this.addSql(`alter table "fms_product_variants" add constraint "fms_product_variants_price_type_id_foreign" foreign key ("price_type_id") references "fms_price_types" ("id") on update cascade on delete set null;`);
  }

}
