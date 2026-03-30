import { Migration } from '@mikro-orm/migrations';

export class Migration20260317130238 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "invoicing_invoices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_number" text not null, "invoice_date" date null, "due_date" date null, "service_date" date null, "seller_name" text null, "seller_tax_id" text null, "seller_address" text null, "seller_country_code" text null, "seller_bank_account" text null, "buyer_name" text null, "buyer_tax_id" text null, "buyer_address" text null, "buyer_country_code" text null, "net_amount" numeric(18,2) not null default '0', "vat_amount" numeric(18,2) not null default '0', "gross_amount" numeric(18,2) not null default '0', "currency_code" text not null default 'PLN', "payment_method" text null, "payment_terms" text null, "direction" text not null default 'outgoing', "source_type" text not null default 'manual', "source_document_invoice_id" uuid null, "source_sales_invoice_id" uuid null, "source_import_reference" text null, "source_document_id" uuid null, "attachment_id" uuid null, "status" text not null default 'draft', "invoice_type" text not null default 'VAT', "corrected_invoice_id" uuid null, "correction_reason" text null, "offline_mode" text null, "offline_qr_data" text null, "ksef_status" text not null default 'none', "ksef_number" text null, "ksef_session_id" uuid null, "ksef_submitted_at" timestamptz null, "ksef_accepted_at" timestamptz null, "ksef_reference_number" text null, "ksef_fa_xml" text null, "ksef_upo_xml" text null, "ksef_error_message" text null, "ksef_error_code" text null, "notes" text null, "metadata" jsonb null, "reviewed_by" uuid null, "reviewed_at" timestamptz null, "review_notes" text null, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "invoicing_invoices_pkey" primary key ("id"));`);
    this.addSql(`create index "invoicing_invoices_ksef_number_idx" on "invoicing_invoices" ("ksef_number");`);
    this.addSql(`alter table "invoicing_invoices" add constraint "invoicing_invoices_ksef_number_uniq" unique ("ksef_number");`);
    this.addSql(`create index "invoicing_invoices_source_sales_idx" on "invoicing_invoices" ("source_sales_invoice_id");`);
    this.addSql(`create index "invoicing_invoices_source_doc_idx" on "invoicing_invoices" ("source_document_invoice_id");`);
    this.addSql(`create index "invoicing_invoices_date_idx" on "invoicing_invoices" ("organization_id", "tenant_id", "invoice_date");`);
    this.addSql(`create index "invoicing_invoices_seller_tax_idx" on "invoicing_invoices" ("organization_id", "tenant_id", "seller_tax_id");`);
    this.addSql(`create index "invoicing_invoices_ksef_status_idx" on "invoicing_invoices" ("organization_id", "tenant_id", "ksef_status");`);
    this.addSql(`create index "invoicing_invoices_status_idx" on "invoicing_invoices" ("organization_id", "tenant_id", "status");`);
    this.addSql(`create index "invoicing_invoices_scope_idx" on "invoicing_invoices" ("organization_id", "tenant_id");`);
    this.addSql(`create index "invoicing_invoices_corrected_idx" on "invoicing_invoices" ("corrected_invoice_id");`);

    this.addSql(`create table "invoicing_ksef_credentials" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "nip" text not null, "auth_type" text not null, "ksef_token" text null, "certificate_pem" text null, "private_key_pem" text null, "environment" text not null default 'test', "is_active" boolean not null default true, "label" text null, "last_used_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "invoicing_ksef_credentials_pkey" primary key ("id"));`);
    this.addSql(`create index "invoicing_ksef_credentials_scope_idx" on "invoicing_ksef_credentials" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "invoicing_ksef_credentials" add constraint "invoicing_ksef_credentials_nip_env_uniq" unique ("organization_id", "tenant_id", "nip", "environment");`);

    this.addSql(`create table "invoicing_ksef_sessions" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "session_type" text not null, "session_status" text not null default 'initializing', "ksef_reference_number" text null, "session_token" text null, "encryption_key" text null, "encryption_iv" text null, "nip" text not null, "invoice_count" int not null default 0, "started_at" timestamptz null, "closed_at" timestamptz null, "error_message" text null, "upo_xml" text null, "upo_downloaded_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "invoicing_ksef_sessions_pkey" primary key ("id"));`);
    this.addSql(`create index "invoicing_ksef_sessions_scope_idx" on "invoicing_ksef_sessions" ("organization_id", "tenant_id");`);

    this.addSql(`create table "invoicing_line_items" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_id" uuid not null, "line_number" int not null, "description" text not null, "quantity" numeric(18,4) not null default '1', "unit" text null, "unit_price_net" numeric(18,4) not null default '0', "vat_rate" numeric(5,2) not null default '0', "vat_rate_code" text null, "net_amount" numeric(18,2) not null default '0', "vat_amount" numeric(18,2) not null default '0', "gross_amount" numeric(18,2) not null default '0', "product_id" uuid null, "gtu_code" text null, "pkwiu_code" text null, "source_line_item_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "invoicing_line_items_pkey" primary key ("id"));`);
    this.addSql(`create index "invoicing_line_items_invoice_idx" on "invoicing_line_items" ("invoice_id");`);
    this.addSql(`create index "invoicing_line_items_scope_idx" on "invoicing_line_items" ("organization_id", "tenant_id");`);

    this.addSql(`create table "invoicing_settings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "ksef_environment" text not null default 'test', "ksef_auto_submit" boolean not null default false, "ksef_session_mode" text not null default 'batch', "default_seller_name" text null, "default_seller_nip" text null, "default_seller_address" text null, "default_seller_country_code" text null, "default_seller_bank_account" text null, "default_payment_method" text null, "auto_import_from_documents" boolean not null default true, "auto_import_from_sales" boolean not null default false, "offline_mode" text not null default 'online', "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "invoicing_settings_pkey" primary key ("id"));`);
    this.addSql(`create index "invoicing_settings_scope_idx" on "invoicing_settings" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "invoicing_settings" add constraint "invoicing_settings_tenant_uniq" unique ("organization_id", "tenant_id");`);

    this.addSql(`alter table "invoicing_line_items" add constraint "invoicing_line_items_invoice_id_foreign" foreign key ("invoice_id") references "invoicing_invoices" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "invoicing_line_items" cascade;`);
    this.addSql(`drop table if exists "invoicing_invoices" cascade;`);
    this.addSql(`drop table if exists "invoicing_ksef_sessions" cascade;`);
    this.addSql(`drop table if exists "invoicing_ksef_credentials" cascade;`);
    this.addSql(`drop table if exists "invoicing_settings" cascade;`);
  }
}
