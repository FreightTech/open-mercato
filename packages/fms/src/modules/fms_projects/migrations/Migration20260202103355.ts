import { Migration } from '@mikro-orm/migrations';

export class Migration20260202103355 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quotes" drop column if exists "incoterm", drop column if exists "valid_until";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quotes" add column if not exists "incoterm" text null, add column if not exists "valid_until" timestamptz null;`);
  }

}
