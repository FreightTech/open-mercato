import { Migration } from '@mikro-orm/migrations';

export class Migration20260211161342 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_project_lines" add column "estimated_unit_cost" numeric(18,4) null, add column "estimated_cost" numeric(18,4) null, add column "actual_sell_unit_price" numeric(18,4) null, add column "actual_sell_amount" numeric(18,4) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_project_lines" drop column "estimated_unit_cost", drop column "estimated_cost", drop column "actual_sell_unit_price", drop column "actual_sell_amount";`);
  }

}
