import { Migration } from '@mikro-orm/migrations'

export class Migration20260125200000 extends Migration {
  override async up(): Promise<void> {
    // Add transportation fields to fms_invoices
    this.addSql(`
      alter table "fms_invoices"
      add column if not exists "document_type" text not null default 'invoice',
      add column if not exists "document_type_confidence" int null,
      add column if not exists "transportation_metadata" jsonb null,
      add column if not exists "bl_number" text null,
      add column if not exists "container_numbers" jsonb null,
      add column if not exists "vessel_name" text null,
      add column if not exists "voyage_number" text null;
    `)

    // Create index on bl_number for searching by B/L
    this.addSql(`
      create index if not exists "fms_invoices_bl_number_idx"
      on "fms_invoices" ("bl_number");
    `)

    // Create fms_invoice_pages table
    this.addSql(`
      create table if not exists "fms_invoice_pages" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "invoice_id" uuid not null,
        "page_number" int not null,
        "storage_path" text not null,
        "storage_driver" text not null default 'local',
        "width" int null,
        "height" int null,
        "file_size" int null,
        "extracted_text" text null,
        "created_at" timestamptz not null,
        constraint "fms_invoice_pages_pkey" primary key ("id"),
        constraint "fms_invoice_pages_invoice_page_unique" unique ("invoice_id", "page_number")
      );
    `)

    // Create indexes for fms_invoice_pages
    this.addSql(`
      create index if not exists "fms_invoice_pages_scope_idx"
      on "fms_invoice_pages" ("organization_id", "tenant_id");
    `)
    this.addSql(`
      create index if not exists "fms_invoice_pages_invoice_idx"
      on "fms_invoice_pages" ("invoice_id");
    `)

    // Add foreign key constraint
    this.addSql(`
      do $$ begin
        alter table "fms_invoice_pages"
        add constraint "fms_invoice_pages_invoice_id_foreign"
        foreign key ("invoice_id") references "fms_invoices" ("id")
        on update cascade on delete cascade;
      exception when others then null; end $$;
    `)
  }

  override async down(): Promise<void> {
    // Drop foreign key constraint
    this.addSql(`
      alter table "fms_invoice_pages"
      drop constraint if exists "fms_invoice_pages_invoice_id_foreign";
    `)

    // Drop fms_invoice_pages table
    this.addSql(`drop table if exists "fms_invoice_pages";`)

    // Remove transportation columns from fms_invoices
    this.addSql(`
      alter table "fms_invoices"
      drop column if exists "document_type",
      drop column if exists "document_type_confidence",
      drop column if exists "transportation_metadata",
      drop column if exists "bl_number",
      drop column if exists "container_numbers",
      drop column if exists "vessel_name",
      drop column if exists "voyage_number";
    `)

    // Drop index
    this.addSql(`drop index if exists "fms_invoices_bl_number_idx";`)
  }
}
