import { Migration } from '@mikro-orm/migrations';

export class Migration20260126232519 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_invoices" add column "custom_reference" text null;`);

    this.addSql(`drop index "fms_products_product_type_index";`);
    this.addSql(`alter table "fms_products" drop column "product_type";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_invoices" drop column "custom_reference";`);

    this.addSql(`alter table "fms_products" add column "product_type" text not null;`);
    this.addSql(`create index "fms_products_product_type_index" on "fms_products" ("product_type");`);
  }

}
