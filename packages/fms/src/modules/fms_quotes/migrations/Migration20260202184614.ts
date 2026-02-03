import { Migration } from '@mikro-orm/migrations';

export class Migration20260202184614 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column if exists "contract_type", drop column if exists "carrier_name", drop column if exists "currency_code", drop column if exists "total_amount";`);

    this.addSql(`alter table "fms_offer_lines" drop column if exists "product_type", drop column if exists "provider_name";`);

    this.addSql(`alter table "fms_offer_lines" add column if not exists "carrier_id" uuid null;`);

    this.addSql(`alter table "fms_quote_lines" drop column if exists "provider_name", drop column if exists "origin", drop column if exists "destination", drop column if exists "quantity", drop column if exists "unit_sales";`);

    this.addSql(`alter table "fms_quote_lines" add column if not exists "origin_location_id" uuid null, add column if not exists "destination_location_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column "contract_type" text not null default 'spot', add column "carrier_name" text null, add column "currency_code" text not null default 'USD', add column "total_amount" numeric(18,4) not null default '0';`);

    this.addSql(`alter table "fms_offer_lines" drop column "carrier_id";`);

    this.addSql(`alter table "fms_offer_lines" add column "product_type" text null, add column "provider_name" text null;`);

    this.addSql(`alter table "fms_quote_lines" drop column "origin_location_id", drop column "destination_location_id";`);

    this.addSql(`alter table "fms_quote_lines" add column "provider_name" text null, add column "origin" text null, add column "destination" text null, add column "quantity" numeric(18,4) not null default '1', add column "unit_sales" numeric(18,4) not null default '0';`);
  }

}
