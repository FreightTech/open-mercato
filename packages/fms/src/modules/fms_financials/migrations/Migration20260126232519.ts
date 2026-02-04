import { Migration } from '@mikro-orm/migrations';

export class Migration20260126232519 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_invoices" add column if not exists "custom_reference" text null;`);

    this.addSql(`drop index if exists "fms_products_product_type_index";`);
    this.addSql(`alter table "fms_products" drop column if exists "product_type";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_invoices" drop column if exists "custom_reference";`);

    this.addSql(`alter table "fms_products" add column if not exists "product_type" text not null;`);
    this.addSql(`create index if not exists "fms_products_product_type_index" on "fms_products" ("product_type");`);
  }

}
