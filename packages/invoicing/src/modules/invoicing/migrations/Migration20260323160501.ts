import { Migration } from '@mikro-orm/migrations';

export class Migration20260323160501 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "invoicing_invoices" add column "source_document_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "invoicing_invoices" drop column "source_document_id";`);
  }

}
