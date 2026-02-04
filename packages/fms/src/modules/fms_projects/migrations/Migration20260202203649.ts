import { Migration } from '@mikro-orm/migrations';

export class Migration20260202203649 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offer_lines" add column if not exists "unit_cost" numeric(18,4) not null default '0';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offer_lines" drop column if exists "unit_cost";`);
  }

}
