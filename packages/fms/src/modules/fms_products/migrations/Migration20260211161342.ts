import { Migration } from '@mikro-orm/migrations';

export class Migration20260211161342 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_products" add column "cost_price" numeric(18,4) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_products" drop column "cost_price";`);
  }

}
