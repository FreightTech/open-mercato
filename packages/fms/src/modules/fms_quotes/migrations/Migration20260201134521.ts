import { Migration } from '@mikro-orm/migrations';

export class Migration20260201134521 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "contractor_credit_limits" add column if not exists "current_exposure" numeric(18,2) not null default '0', add column if not exists "last_calculated_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "contractor_credit_limits" drop column "current_exposure", drop column "last_calculated_at";`);
  }

}
