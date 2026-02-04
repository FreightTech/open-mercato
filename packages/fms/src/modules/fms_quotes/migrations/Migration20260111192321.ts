import { Migration } from '@mikro-orm/migrations';

export class Migration20260111192321 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_offers" add column if not exists "version" int not null default 1, add column if not exists "payment_terms" text null, add column if not exists "special_terms" text null, add column if not exists "customer_notes" text null, add column if not exists "superseded_by_id" uuid null;`);

    this.addSql(`alter table "fms_offer_lines" add column if not exists "product_name" text null, add column if not exists "charge_code" text null, add column if not exists "container_size" text null;`);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_name') then
          alter table "fms_offer_lines" alter column "charge_name" type text using ("charge_name"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_name') then
          alter table "fms_offer_lines" alter column "charge_name" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_category') then
          alter table "fms_offer_lines" alter column "charge_category" type text using ("charge_category"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_category') then
          alter table "fms_offer_lines" alter column "charge_category" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_unit') then
          alter table "fms_offer_lines" alter column "charge_unit" type text using ("charge_unit"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_unit') then
          alter table "fms_offer_lines" alter column "charge_unit" drop not null;
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_offers" drop column if exists "version", drop column if exists "payment_terms", drop column if exists "special_terms", drop column if exists "customer_notes", drop column if exists "superseded_by_id";`);

    this.addSql(`alter table "fms_offer_lines" drop column if exists "product_name", drop column if exists "charge_code", drop column if exists "container_size";`);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_name') then
          alter table "fms_offer_lines" alter column "charge_name" type text using ("charge_name"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_name') then
          alter table "fms_offer_lines" alter column "charge_name" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_category') then
          alter table "fms_offer_lines" alter column "charge_category" type text using ("charge_category"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_category') then
          alter table "fms_offer_lines" alter column "charge_category" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_unit') then
          alter table "fms_offer_lines" alter column "charge_unit" type text using ("charge_unit"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_offer_lines' and column_name = 'charge_unit') then
          alter table "fms_offer_lines" alter column "charge_unit" set not null;
        end if;
      end $$;
    `);
  }

}
