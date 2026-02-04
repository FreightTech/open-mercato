import { Migration } from '@mikro-orm/migrations';

export class Migration20260131132429 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" add column if not exists "origin" text null, add column if not exists "destination" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" drop column if exists "origin", drop column if exists "destination";`);
  }

}
