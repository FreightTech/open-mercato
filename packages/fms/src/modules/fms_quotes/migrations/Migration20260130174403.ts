import { Migration } from '@mikro-orm/migrations';

export class Migration20260130174403 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" drop column if exists "price_id";`);
    this.addSql(`alter table "fms_quote_lines" add column if not exists "validity_start" date null;`);
    this.addSql(`alter table "fms_quote_lines" add column if not exists "validity_end" date null;`);
    this.addSql(`alter table "fms_quote_lines" rename column "contract_type" to "reference";`);

    this.addSql(`alter table "fms_offer_lines" drop column if exists "charge_name";`);
    this.addSql(`alter table "fms_offer_lines" drop column if exists "charge_category";`);
    this.addSql(`alter table "fms_offer_lines" drop column if exists "charge_unit";`);
    this.addSql(`alter table "fms_offer_lines" drop column if exists "container_type";`);

    this.addSql(`alter table "fms_offer_lines" add column if not exists "product_type" text null;`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "provider_name" text null;`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "reference" text null;`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "validity_start" date null;`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "validity_end" date null;`);
    this.addSql(`alter table "fms_offer_lines" rename column "price_id" to "provider_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" drop column "validity_start", drop column "validity_end";`);
    this.addSql(`alter table "fms_quote_lines" add column "price_id" uuid null;`);
    this.addSql(`alter table "fms_quote_lines" rename column "reference" to "contract_type";`);

    this.addSql(`alter table "fms_offer_lines" drop column "product_type", drop column "provider_name", drop column "reference", drop column "validity_start", drop column "validity_end";`);
    this.addSql(`alter table "fms_offer_lines" add column "charge_name" text null, add column "charge_category" text null, add column "charge_unit" text null, add column "container_type" text null;`);
    this.addSql(`alter table "fms_offer_lines" rename column "provider_id" to "price_id";`);
  }

}
