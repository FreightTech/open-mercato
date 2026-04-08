import { Migration } from '@mikro-orm/migrations'

/**
 * FMS Invoicing table rename + KSeF column cleanup.
 *
 * Renames invoicing_* tables to fms_invoicing_*.
 * Drops KSeF-specific columns (now in ksef_submissions).
 * Drops old KSeF credential/session tables.
 *
 * MUST run AFTER the ksef extraction migration (Migration20260330000001).
 */
export class Migration20260330000002 extends Migration {

  override async up(): Promise<void> {
    // 1. Rename invoicing tables to fms_invoicing (if old names exist)
    this.addSql(`do $$
    begin
      if exists (select 1 from information_schema.tables where table_name = 'invoicing_invoices') then
        alter table "invoicing_invoices" rename to "fms_invoicing_invoices";
      end if;
      if exists (select 1 from information_schema.tables where table_name = 'invoicing_line_items') then
        alter table "invoicing_line_items" rename to "fms_invoicing_line_items";
      end if;
      if exists (select 1 from information_schema.tables where table_name = 'invoicing_settings') then
        alter table "invoicing_settings" rename to "fms_invoicing_settings";
      end if;
    end $$;`)

    // 2. Rename constraints and indexes
    this.addSql(`do $$
    begin
      -- Primary keys
      if exists (select 1 from pg_constraint where conname = 'invoicing_invoices_pkey') then
        alter table "fms_invoicing_invoices" rename constraint "invoicing_invoices_pkey" to "fms_invoicing_invoices_pkey";
      end if;
      if exists (select 1 from pg_constraint where conname = 'invoicing_line_items_pkey') then
        alter table "fms_invoicing_line_items" rename constraint "invoicing_line_items_pkey" to "fms_invoicing_line_items_pkey";
      end if;
      if exists (select 1 from pg_constraint where conname = 'invoicing_settings_pkey') then
        alter table "fms_invoicing_settings" rename constraint "invoicing_settings_pkey" to "fms_invoicing_settings_pkey";
      end if;

      -- Unique constraints
      if exists (select 1 from pg_constraint where conname = 'invoicing_settings_tenant_uniq') then
        alter table "fms_invoicing_settings" rename constraint "invoicing_settings_tenant_uniq" to "fms_invoicing_settings_tenant_uniq";
      end if;

      -- Foreign keys
      if exists (select 1 from pg_constraint where conname = 'invoicing_line_items_invoice_id_foreign') then
        alter table "fms_invoicing_line_items" rename constraint "invoicing_line_items_invoice_id_foreign" to "fms_invoicing_line_items_invoice_id_foreign";
      end if;
    end $$;`)

    // Rename indexes
    this.addSql(`do $$
    begin
      if exists (select 1 from pg_indexes where indexname = 'invoicing_invoices_scope_idx') then
        alter index "invoicing_invoices_scope_idx" rename to "fms_invoicing_invoices_scope_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_invoices_status_idx') then
        alter index "invoicing_invoices_status_idx" rename to "fms_invoicing_invoices_status_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_invoices_seller_tax_idx') then
        alter index "invoicing_invoices_seller_tax_idx" rename to "fms_invoicing_invoices_seller_tax_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_invoices_date_idx') then
        alter index "invoicing_invoices_date_idx" rename to "fms_invoicing_invoices_date_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_invoices_source_doc_idx') then
        alter index "invoicing_invoices_source_doc_idx" rename to "fms_invoicing_invoices_source_doc_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_invoices_source_sales_idx') then
        alter index "invoicing_invoices_source_sales_idx" rename to "fms_invoicing_invoices_source_sales_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_invoices_corrected_idx') then
        alter index "invoicing_invoices_corrected_idx" rename to "fms_invoicing_invoices_corrected_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_line_items_scope_idx') then
        alter index "invoicing_line_items_scope_idx" rename to "fms_invoicing_line_items_scope_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_line_items_invoice_idx') then
        alter index "invoicing_line_items_invoice_idx" rename to "fms_invoicing_line_items_invoice_idx";
      end if;
      if exists (select 1 from pg_indexes where indexname = 'invoicing_settings_scope_idx') then
        alter index "invoicing_settings_scope_idx" rename to "fms_invoicing_settings_scope_idx";
      end if;
    end $$;`)

    // 1b. Create tables from scratch if neither old nor new names exist (fresh ephemeral DBs)
    this.addSql(`do $$ begin
      if not exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_invoices') then
        create table "fms_invoicing_invoices" (
          "id" uuid not null default gen_random_uuid(),
          "organization_id" uuid not null,
          "tenant_id" uuid not null,
          "invoice_number" text not null,
          "invoice_date" timestamptz not null default now(),
          "due_date" timestamptz null,
          "status" text not null default 'draft',
          "invoice_type" text not null default 'VAT',
          "currency_code" text not null default 'PLN',
          "net_amount" numeric(18,2) not null default 0,
          "tax_amount" numeric(18,2) not null default 0,
          "gross_amount" numeric(18,2) not null default 0,
          "seller_name" text null,
          "seller_tax_id" text null,
          "seller_address" text null,
          "buyer_name" text null,
          "buyer_tax_id" text null,
          "buyer_address" text null,
          "notes" text null,
          "source_document_id" text null,
          "source_sales_order_id" uuid null,
          "corrected_invoice_id" uuid null,
          "correction_reason" text null,
          "created_at" timestamptz not null default now(),
          "updated_at" timestamptz not null default now(),
          "deleted_at" timestamptz null,
          "created_by" uuid null,
          "updated_by" uuid null,
          constraint "fms_invoicing_invoices_pkey" primary key ("id")
        );
        create index "fms_invoicing_invoices_scope_idx" on "fms_invoicing_invoices" ("organization_id", "tenant_id");
        create index "fms_invoicing_invoices_status_idx" on "fms_invoicing_invoices" ("organization_id", "tenant_id", "status");
      end if;
      if not exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_line_items') then
        create table "fms_invoicing_line_items" (
          "id" uuid not null default gen_random_uuid(),
          "organization_id" uuid not null,
          "tenant_id" uuid not null,
          "invoice_id" uuid not null references "fms_invoicing_invoices"("id"),
          "line_number" integer not null default 0,
          "description" text null,
          "quantity" numeric(18,4) not null default 1,
          "unit_price" numeric(18,4) not null default 0,
          "tax_rate" numeric(5,2) not null default 0,
          "net_amount" numeric(18,2) not null default 0,
          "tax_amount" numeric(18,2) not null default 0,
          "gross_amount" numeric(18,2) not null default 0,
          "created_at" timestamptz not null default now(),
          "updated_at" timestamptz not null default now(),
          "deleted_at" timestamptz null,
          constraint "fms_invoicing_line_items_pkey" primary key ("id")
        );
        create index "fms_invoicing_line_items_scope_idx" on "fms_invoicing_line_items" ("organization_id", "tenant_id");
        create index "fms_invoicing_line_items_invoice_idx" on "fms_invoicing_line_items" ("invoice_id");
      end if;
      if not exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_settings') then
        create table "fms_invoicing_settings" (
          "id" uuid not null default gen_random_uuid(),
          "organization_id" uuid not null,
          "tenant_id" uuid not null,
          "next_invoice_number" integer not null default 1,
          "invoice_prefix" text null default 'FV',
          "default_tax_rate" numeric(5,2) null default 23,
          "default_currency" text null default 'PLN',
          "default_payment_days" integer null default 14,
          "created_at" timestamptz not null default now(),
          "updated_at" timestamptz not null default now(),
          constraint "fms_invoicing_settings_pkey" primary key ("id"),
          constraint "fms_invoicing_settings_tenant_uniq" unique ("organization_id", "tenant_id")
        );
        create index "fms_invoicing_settings_scope_idx" on "fms_invoicing_settings" ("organization_id", "tenant_id");
      end if;
    end $$;`)

    // 2b. Ensure invoice_type and correction columns exist (may have been lost in earlier migrations)
    //     Guard: only if the table exists
    this.addSql(`do $$ begin
      if exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_invoices') then
        alter table "fms_invoicing_invoices"
          add column if not exists "invoice_type" text not null default 'VAT',
          add column if not exists "corrected_invoice_id" uuid null,
          add column if not exists "correction_reason" text null;
        create index if not exists "fms_invoicing_invoices_corrected_idx" on "fms_invoicing_invoices" ("corrected_invoice_id");
      end if;
    end $$;`)

    // 3. Drop KSeF columns from fms_invoicing_invoices
    this.addSql(`do $$ begin
      if exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_invoices') then
        alter table "fms_invoicing_invoices"
          drop column if exists "ksef_status",
          drop column if exists "ksef_number",
          drop column if exists "ksef_session_id",
          drop column if exists "ksef_submitted_at",
          drop column if exists "ksef_accepted_at",
          drop column if exists "ksef_reference_number",
          drop column if exists "ksef_fa_xml",
          drop column if exists "ksef_upo_xml",
          drop column if exists "ksef_error_message",
          drop column if exists "ksef_error_code",
          drop column if exists "offline_mode",
          drop column if exists "offline_qr_data";
      end if;
    end $$;`)

    // 4. Drop KSeF indexes from invoices
    this.addSql(`drop index if exists "invoicing_invoices_ksef_number_idx";`)
    this.addSql(`drop index if exists "invoicing_invoices_ksef_number_uniq";`)
    this.addSql(`drop index if exists "fms_invoicing_invoices_ksef_number_idx";`)
    this.addSql(`drop index if exists "fms_invoicing_invoices_ksef_number_uniq";`)
    this.addSql(`drop index if exists "invoicing_invoices_ksef_status_idx";`)
    this.addSql(`drop index if exists "fms_invoicing_invoices_ksef_status_idx";`)

    // 5. Drop KSeF columns from fms_invoicing_settings
    this.addSql(`do $$ begin
      if exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_settings') then
        alter table "fms_invoicing_settings"
          drop column if exists "ksef_environment",
          drop column if exists "ksef_auto_submit",
          drop column if exists "ksef_session_mode",
          drop column if exists "offline_mode";
      end if;
    end $$;`)

    // 6. Drop old KSeF tables
    this.addSql(`drop table if exists "invoicing_ksef_credentials" cascade;`)
    this.addSql(`drop table if exists "invoicing_ksef_sessions" cascade;`)
  }

  override async down(): Promise<void> {
    // Reverse rename: fms_invoicing_* -> invoicing_*
    this.addSql(`do $$
    begin
      if exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_invoices') then
        alter table "fms_invoicing_invoices" rename to "invoicing_invoices";
      end if;
      if exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_line_items') then
        alter table "fms_invoicing_line_items" rename to "invoicing_line_items";
      end if;
      if exists (select 1 from information_schema.tables where table_name = 'fms_invoicing_settings') then
        alter table "fms_invoicing_settings" rename to "invoicing_settings";
      end if;
    end $$;`)
  }
}
