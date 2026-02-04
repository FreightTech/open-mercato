import { Migration } from '@mikro-orm/migrations';

export class Migration20260112100000_contractor_addresses_simplify extends Migration {

  override async up(): Promise<void> {
    // Drop label and country_code columns
    this.addSql(`alter table "contractor_addresses" drop column if exists "label";`);
    this.addSql(`alter table "contractor_addresses" drop column if exists "country_code";`);

    // Add country column
    this.addSql(`alter table "contractor_addresses" add column if not exists "country" text null;`);

    // Make city and address_line nullable
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'contractor_addresses' and column_name = 'city' and is_nullable = 'NO') then
          alter table "contractor_addresses" alter column "city" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'contractor_addresses' and column_name = 'address_line' and is_nullable = 'NO') then
          alter table "contractor_addresses" alter column "address_line" drop not null;
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    // Add back label and country_code columns
    this.addSql(`alter table "contractor_addresses" add column if not exists "label" text null;`);
    this.addSql(`alter table "contractor_addresses" add column if not exists "country_code" text not null default '';`);

    // Drop country column
    this.addSql(`alter table "contractor_addresses" drop column if exists "country";`);

    // Make city and address_line required again (only if columns exist)
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'contractor_addresses' and column_name = 'city') then
          alter table "contractor_addresses" alter column "city" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'contractor_addresses' and column_name = 'address_line') then
          alter table "contractor_addresses" alter column "address_line" set not null;
        end if;
      end $$;
    `);
  }
}
