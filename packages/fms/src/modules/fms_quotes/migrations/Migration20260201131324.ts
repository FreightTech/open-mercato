import { Migration } from '@mikro-orm/migrations';

export class Migration20260201131324 extends Migration {

  override async up(): Promise<void> {
    // Drop foreign key constraints if they exist (may not exist if already using module isomorphism)
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_quotes') then
          alter table "fms_quotes" drop constraint if exists "fms_quotes_assigned_to_id_foreign";
        end if;
      end $$;
    `);
    this.addSql(`
      do $$ begin
        if exists (select 1 from information_schema.tables where table_name = 'fms_offers') then
          alter table "fms_offers" drop constraint if exists "fms_offers_assigned_to_id_foreign";
        end if;
      end $$;
    `);

    // Remove assigned_to_id column and add guardian columns
    this.addSql(`alter table "fms_quotes" drop column if exists "assigned_to_id";`);
    this.addSql(`alter table "fms_quotes" add column if not exists "operational_guardian_id" uuid null, add column if not exists "business_guardian_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quotes" drop column if exists "operational_guardian_id", drop column if exists "business_guardian_id";`);

    this.addSql(`alter table "fms_quotes" add column if not exists "assigned_to_id" uuid null;`);
  }

}
