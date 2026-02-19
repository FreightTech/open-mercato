import { Migration } from '@mikro-orm/migrations';

export class Migration20260215193133 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "fms_documents" add column "mbl_number" text null;`);
    this.addSql(`create index "fms_documents_mbl_number_idx" on "fms_documents" ("mbl_number");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "fms_documents_mbl_number_idx";`);
    this.addSql(`alter table "fms_documents" drop column "mbl_number";`);
  }

}
