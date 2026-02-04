import { Migration } from '@mikro-orm/migrations';

export class Migration20260112110000_contractor_contacts_optional_names extends Migration {

  override async up(): Promise<void> {
    // Make firstName and lastName nullable
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'contractor_contacts' and column_name = 'first_name' and is_nullable = 'NO') then
          alter table "contractor_contacts" alter column "first_name" drop not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'contractor_contacts' and column_name = 'last_name' and is_nullable = 'NO') then
          alter table "contractor_contacts" alter column "last_name" drop not null;
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    // Make firstName and lastName required again
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'contractor_contacts' and column_name = 'first_name') then
          alter table "contractor_contacts" alter column "first_name" set not null;
        end if;
      end $$;
    `);
    this.addSql(`
      do $$
      begin
        if exists (select 1 from information_schema.columns where table_name = 'contractor_contacts' and column_name = 'last_name') then
          alter table "contractor_contacts" alter column "last_name" set not null;
        end if;
      end $$;
    `);
  }
}
