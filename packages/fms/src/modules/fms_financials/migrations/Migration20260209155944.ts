import { Migration } from '@mikro-orm/migrations';

export class Migration20260209155944 extends Migration {

  override async up(): Promise<void> {
    // Drop old FK from invoice line items to charge_codes
    this.addSql(`alter table "fms_invoice_line_items" drop constraint if exists "fms_invoice_line_items_charge_code_id_foreign";`);

    // Drop old index
    this.addSql(`drop index if exists "fms_invoice_line_items_charge_code_idx";`);

    // Rename charge_code_id to product_id (now references fms_products)
    this.addSql(`alter table "fms_invoice_line_items" rename column "charge_code_id" to "product_id";`);

    // Clear old charge_code references — they point to fms_charge_codes, not fms_products
    this.addSql(`update "fms_invoice_line_items" set "product_id" = null where "product_id" is not null;`);

    this.addSql(`alter table "fms_invoice_line_items" add constraint "fms_invoice_line_items_product_id_foreign" foreign key ("product_id") references "fms_products" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "fms_invoice_line_items_product_idx" on "fms_invoice_line_items" ("product_id");`);
  }

  override async down(): Promise<void> {
    // Drop new FK and index
    this.addSql(`alter table "fms_invoice_line_items" drop constraint "fms_invoice_line_items_product_id_foreign";`);
    this.addSql(`drop index "fms_invoice_line_items_product_idx";`);

    // Rename product_id back to charge_code_id
    this.addSql(`alter table "fms_invoice_line_items" rename column "product_id" to "charge_code_id";`);
    this.addSql(`alter table "fms_invoice_line_items" add constraint "fms_invoice_line_items_charge_code_id_foreign" foreign key ("charge_code_id") references "fms_charge_codes" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "fms_invoice_line_items_charge_code_idx" on "fms_invoice_line_items" ("charge_code_id");`);
  }

}
