import { Migration } from '@mikro-orm/migrations';

export class Migration20260202103355 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_quotes" drop column "incoterm", drop column "valid_until";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_quotes" add column "incoterm" text null, add column "valid_until" timestamptz null;`);
  }

}
