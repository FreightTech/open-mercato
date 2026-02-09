import { Migration } from '@mikro-orm/migrations';

export class Migration20260209120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "contractor_credit_limits" add column if not exists "payment_days" int not null default 30;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "contractor_credit_limits" drop column if exists "payment_days";`);
  }

}
