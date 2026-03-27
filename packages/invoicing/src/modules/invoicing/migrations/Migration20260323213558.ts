import { Migration } from '@mikro-orm/migrations';

export class Migration20260323213558 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "invoicing_line_items" add column "source_line_item_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "invoicing_line_items" drop column "source_line_item_id";`);
  }

}
