import { Migration } from '@mikro-orm/migrations'

/**
 * KSeF UMES extraction migration.
 *
 * Creates ksef_submissions and ksef_sessions tables.
 * Migrates KSeF data from invoicing_invoices ksef columns into ksef_submissions.
 * Migrates session data from invoicing_ksef_sessions into ksef_sessions.
 *
 * MUST run BEFORE the fms_invoicing table rename migration.
 */
export class Migration20260330000001 extends Migration {

  override async up(): Promise<void> {
    // 1. Create ksef_submissions table
    this.addSql(`create table "ksef_submissions" (
      "id" uuid not null default gen_random_uuid(),
      "organization_id" uuid not null,
      "tenant_id" uuid not null,
      "invoice_id" uuid not null,
      "status" text not null default 'none',
      "ksef_number" text null,
      "ksef_reference_number" text null,
      "ksef_session_id" uuid null,
      "submitted_at" timestamptz null,
      "accepted_at" timestamptz null,
      "fa_xml" text null,
      "upo_xml" text null,
      "error_message" text null,
      "error_code" text null,
      "offline_mode" text null,
      "offline_qr_data" text null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "ksef_submissions_pkey" primary key ("id")
    );`)
    this.addSql(`create index "ksef_submissions_scope_idx" on "ksef_submissions" ("organization_id", "tenant_id");`)
    this.addSql(`create index "ksef_submissions_invoice_idx" on "ksef_submissions" ("invoice_id");`)
    this.addSql(`create unique index "ksef_submissions_ksef_number_uniq" on "ksef_submissions" ("ksef_number") where "ksef_number" is not null;`)
    this.addSql(`create index "ksef_submissions_ksef_number_idx" on "ksef_submissions" ("ksef_number");`)
    this.addSql(`create index "ksef_submissions_status_idx" on "ksef_submissions" ("organization_id", "tenant_id", "status");`)

    // 2. Create ksef_sessions table
    this.addSql(`create table "ksef_sessions" (
      "id" uuid not null default gen_random_uuid(),
      "organization_id" uuid not null,
      "tenant_id" uuid not null,
      "session_type" text not null,
      "session_status" text not null default 'initializing',
      "ksef_reference_number" text null,
      "session_token" text null,
      "encryption_key" text null,
      "encryption_iv" text null,
      "nip" text not null,
      "invoice_count" int not null default 0,
      "started_at" timestamptz null,
      "closed_at" timestamptz null,
      "error_message" text null,
      "upo_xml" text null,
      "upo_downloaded_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "ksef_sessions_pkey" primary key ("id")
    );`)
    this.addSql(`create index "ksef_sessions_scope_idx" on "ksef_sessions" ("organization_id", "tenant_id");`)

    // 3. Migrate session data and KSeF invoice data from old tables (if they exist)
    this.addSql(`do $$
    begin
      if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invoicing_ksef_sessions') then
        insert into "ksef_sessions" select * from "invoicing_ksef_sessions";
      end if;

      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoicing_invoices' and column_name = 'ksef_status') then
        insert into "ksef_submissions" (
          "organization_id", "tenant_id", "invoice_id", "status",
          "ksef_number", "ksef_reference_number", "ksef_session_id",
          "submitted_at", "accepted_at", "fa_xml", "upo_xml",
          "error_message", "error_code", "offline_mode", "offline_qr_data",
          "created_at", "updated_at"
        )
        select
          "organization_id", "tenant_id", "id", "ksef_status",
          "ksef_number", "ksef_reference_number", "ksef_session_id",
          "ksef_submitted_at", "ksef_accepted_at", "ksef_fa_xml", "ksef_upo_xml",
          "ksef_error_message", "ksef_error_code", "offline_mode", "offline_qr_data",
          "created_at", "updated_at"
        from "invoicing_invoices"
        where "ksef_status" is not null and "ksef_status" != 'none';
      end if;
    end $$;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ksef_submissions" cascade;`)
    this.addSql(`drop table if exists "ksef_sessions" cascade;`)
  }
}
