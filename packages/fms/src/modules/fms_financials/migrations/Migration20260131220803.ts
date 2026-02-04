import { Migration } from '@mikro-orm/migrations';

export class Migration20260131220803 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_charge_codes" alter column "keywords" type text using ("keywords"::text);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_charge_codes" alter column "keywords" type jsonb using ("keywords"::jsonb);`);
  }

}
