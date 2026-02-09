import { Migration } from '@mikro-orm/migrations';

export class Migration20260209231642 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_invoice_line_items" add constraint "fms_invoice_line_items_product_id_foreign" foreign key ("product_id") references "fms_products" ("id") on update cascade on delete set null;`);
  }

}
