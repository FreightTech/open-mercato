import { Migration } from '@mikro-orm/migrations';

export class Migration20260202193712 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" add column "unit_sales" numeric(18,4) not null default '0';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" drop column "unit_sales";`);
  }

}
