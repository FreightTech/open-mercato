import { Migration } from '@mikro-orm/migrations';

export class Migration20260207163205 extends Migration {

  override async up(): Promise<void> {
    // Drop fms_product_variants foreign keys and table
    this.addSql(`alter table "fms_product_variants" drop constraint if exists "fms_product_variants_product_id_foreign";`);
    this.addSql(`alter table "fms_product_variants" drop constraint if exists "fms_product_variants_provider_id_foreign";`);
    this.addSql(`drop table if exists "fms_product_variants" cascade;`);

    // Drop fms_products foreign keys for removed columns
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_carrier_id_foreign";`);
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_source_id_foreign";`);
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_destination_id_foreign";`);
    this.addSql(`alter table "fms_products" drop constraint if exists "fms_products_location_id_foreign";`);

    // Drop index and columns from fms_products
    this.addSql(`drop index if exists "fms_products_carrier_idx";`);
    this.addSql(`alter table "fms_products" drop column "carrier_id", drop column "internal_notes", drop column "loop", drop column "source_id", drop column "destination_id", drop column "transit_time", drop column "location_id", drop column "description";`);
  }

}
