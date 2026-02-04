import { Migration } from '@mikro-orm/migrations';

export class Migration20260108202900 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_quotes') then
          alter table "fms_quotes" drop constraint if exists "fms_quotes_number_unique";
        end if;
      end $$;
    `);

    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'quote_number') then
          alter table "fms_quotes" alter column "quote_number" type text using ("quote_number"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'quote_number') then
          alter table "fms_quotes" alter column "quote_number" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'direction') then
          alter table "fms_quotes" alter column "direction" type text using ("direction"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'direction') then
          alter table "fms_quotes" alter column "direction" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'cargo_type') then
          alter table "fms_quotes" alter column "cargo_type" type text using ("cargo_type"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'cargo_type') then
          alter table "fms_quotes" alter column "cargo_type" drop not null;
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'quote_number') then
          alter table "fms_quotes" alter column "quote_number" type text using ("quote_number"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'quote_number') then
          alter table "fms_quotes" alter column "quote_number" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'direction') then
          alter table "fms_quotes" alter column "direction" type text using ("direction"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'direction') then
          alter table "fms_quotes" alter column "direction" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'cargo_type') then
          alter table "fms_quotes" alter column "cargo_type" type text using ("cargo_type"::text);
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.columns where table_name = 'fms_quotes' and column_name = 'cargo_type') then
          alter table "fms_quotes" alter column "cargo_type" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        alter table "fms_quotes" add constraint "fms_quotes_number_unique" unique ("organization_id", "tenant_id", "quote_number");
      exception when others then null; end $$;
    `);
  }

}
