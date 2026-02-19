import { Migration } from '@mikro-orm/migrations';

export class Migration20260210134053 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column "operational_guardian_id" uuid null, add column "business_guardian_id" uuid null, add column "exchange_rates" jsonb null;`);

    this.addSql(`alter table "fms_offer_lines" add column "unit_cost" numeric(18,4) not null default '0';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column "operational_guardian_id", drop column "business_guardian_id", drop column "exchange_rates";`);

    this.addSql(`alter table "fms_offer_lines" drop column "unit_cost";`);
  }

}
