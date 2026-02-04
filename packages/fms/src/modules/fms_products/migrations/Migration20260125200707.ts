import { Migration } from '@mikro-orm/migrations';

export class Migration20260125200707 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_product_variants" add column if not exists "internal_notes" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_product_variants" drop column if exists "internal_notes";`);
  }

}
