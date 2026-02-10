import { Migration } from '@mikro-orm/migrations';

export class Migration20260126232519 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_invoices" add column if not exists "custom_reference" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_invoices" drop column if exists "custom_reference";`);
  }
}
