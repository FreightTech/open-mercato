import { Migration } from '@mikro-orm/migrations';

export class Migration20260131220803 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if exists (
          select 1 from information_schema.columns
          where table_name = 'fms_charge_codes' and column_name = 'keywords'
        ) then
          alter table "fms_charge_codes" alter column "keywords" type text using ("keywords"::text);
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if exists (
          select 1 from information_schema.columns
          where table_name = 'fms_charge_codes' and column_name = 'keywords'
        ) then
          alter table "fms_charge_codes" alter column "keywords" type jsonb using ("keywords"::jsonb);
        end if;
      end $$;
    `);
  }

}
