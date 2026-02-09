import { Migration } from '@mikro-orm/migrations';

export class Migration20260130174403 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" drop column if exists "price_id";`);
    this.addSql(`alter table "fms_quote_lines" add column if not exists "validity_start" date null;`);
    this.addSql(`alter table "fms_quote_lines" add column if not exists "validity_end" date null;`);
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quote_lines' and column_name = 'contract_type') then
          alter table "fms_quote_lines" rename column "contract_type" to "reference";
        end if;
      end $$;
    `);

    this.addSql(`alter table "fms_offer_lines" drop column if exists "charge_name";`);
    this.addSql(`alter table "fms_offer_lines" drop column if exists "charge_category";`);
    this.addSql(`alter table "fms_offer_lines" drop column if exists "charge_unit";`);
    this.addSql(`alter table "fms_offer_lines" drop column if exists "container_type";`);

    this.addSql(`alter table "fms_offer_lines" add column if not exists "product_type" text null;`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "provider_name" text null;`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "reference" text null;`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "validity_start" date null;`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "validity_end" date null;`);
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'price_id')
           and not exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'provider_id') then
          alter table "fms_offer_lines" rename column "price_id" to "provider_id";
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" drop column if exists "validity_start", drop column if exists "validity_end";`);
    this.addSql(`alter table "fms_quote_lines" add column if not exists "price_id" uuid null;`);
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quote_lines' and column_name = 'reference') then
          alter table "fms_quote_lines" rename column "reference" to "contract_type";
        end if;
      end $$;
    `);

    this.addSql(`alter table "fms_offer_lines" drop column if exists "product_type", drop column if exists "provider_name", drop column if exists "reference", drop column if exists "validity_start", drop column if exists "validity_end";`);
    this.addSql(`alter table "fms_offer_lines" add column if not exists "charge_name" text null, add column if not exists "charge_category" text null, add column if not exists "charge_unit" text null, add column if not exists "container_type" text null;`);
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'provider_id') then
          alter table "fms_offer_lines" rename column "provider_id" to "price_id";
        end if;
      end $$;
    `);
  }

}
