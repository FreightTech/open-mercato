import { Migration } from '@mikro-orm/migrations';

export class Migration20260209231642 extends Migration {

  override async up(): Promise<void> {
    // FK moved to fms_documents module (Migration20260209231639) which owns the fms_invoice_line_items table
  }

}
