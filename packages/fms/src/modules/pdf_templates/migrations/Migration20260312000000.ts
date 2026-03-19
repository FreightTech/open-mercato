import { Migration } from '@mikro-orm/migrations'

/**
 * Migration to create the fms_pdfme_templates table for pdfme-based visual PDF templates.
 * This replaces the HTML-based templating with a visual drag-and-drop designer.
 */
export class Migration20260312000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "fms_pdfme_templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "template_type" text NOT NULL,
        "name" text NOT NULL,
        "description" text NULL,
        "template_json" jsonb NOT NULL,
        "preview_image_url" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "deleted_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fms_pdfme_templates_pkey" PRIMARY KEY ("id")
      );
    `)

    // Create indexes
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "fms_pdfme_templates_org_tenant_idx" 
      ON "fms_pdfme_templates" ("organization_id", "tenant_id");
    `)

    // Create unique constraint for one active template per type per tenant
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "fms_pdfme_templates_scope_type_unique" 
      ON "fms_pdfme_templates" ("organization_id", "tenant_id", "template_type")
      WHERE "deleted_at" IS NULL;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "fms_pdfme_templates";`)
  }
}
