import { Migration } from '@mikro-orm/migrations'

export class Migration20260127000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "fms_pdf_settings" 
      ADD COLUMN IF NOT EXISTS "cover_page_image_url" text NULL,
      ADD COLUMN IF NOT EXISTS "rules_agreement_html" text NULL;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "fms_pdf_settings" 
      DROP COLUMN IF EXISTS "cover_page_image_url",
      DROP COLUMN IF EXISTS "rules_agreement_html";
    `)
  }
}
