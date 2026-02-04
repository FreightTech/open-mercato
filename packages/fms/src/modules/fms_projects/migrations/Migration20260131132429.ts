import { Migration } from '@mikro-orm/migrations';

export class Migration20260131132429 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" add column "origin" text null, add column "destination" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quote_lines" drop column "origin", drop column "destination";`);
  }

}
