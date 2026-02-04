import { Migration } from '@mikro-orm/migrations';

export class Migration20260202200902 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column if not exists "exchange_rates" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column if exists "exchange_rates";`);
  }

}
