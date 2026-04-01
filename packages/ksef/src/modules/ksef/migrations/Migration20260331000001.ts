import { Migration } from '@mikro-orm/migrations'

/**
 * KSeF standalone invoice entities migration.
 *
 * Creates ksef_invoices and ksef_invoice_line_items tables.
 * Adds ksef_invoice_id column to ksef_submissions.
 * Makes invoice_id nullable in ksef_submissions (was required for fms_invoicing bridge).
 */
export class Migration20260331000001 extends Migration {

  override async up(): Promise<void> {
    // 1. Create ksef_invoices table
    this.addSql(`create table "ksef_invoices" (
      "id" uuid not null default gen_random_uuid(),
      "organization_id" uuid not null,
      "tenant_id" uuid not null,
      "invoice_number" text not null,
      "invoice_date" date null,
      "due_date" date null,
      "service_date" date null,
      "seller_name" text null,
      "seller_tax_id" text null,
      "seller_address" text null,
      "seller_country_code" text null,
      "seller_bank_account" text null,
      "buyer_name" text null,
      "buyer_tax_id" text null,
      "buyer_address" text null,
      "buyer_country_code" text null,
      "net_amount" numeric(18, 2) not null default '0',
      "vat_amount" numeric(18, 2) not null default '0',
      "gross_amount" numeric(18, 2) not null default '0',
      "currency_code" text not null default 'PLN',
      "payment_method" text null,
      "invoice_type" text not null default 'VAT',
      "corrected_invoice_id" uuid null,
      "correction_reason" text null,
      "direction" text not null default 'outgoing',
      "external_invoice_id" uuid null,
      "deleted_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "ksef_invoices_pkey" primary key ("id")
    );`)
    this.addSql(`create index "ksef_invoices_scope_idx" on "ksef_invoices" ("organization_id", "tenant_id");`)
    this.addSql(`create index "ksef_invoices_direction_idx" on "ksef_invoices" ("organization_id", "tenant_id", "direction");`)
    this.addSql(`create index "ksef_invoices_external_idx" on "ksef_invoices" ("external_invoice_id");`)

    // 2. Create ksef_invoice_line_items table
    this.addSql(`create table "ksef_invoice_line_items" (
      "id" uuid not null default gen_random_uuid(),
      "invoice_id" uuid not null,
      "line_number" int not null,
      "description" text not null,
      "quantity" numeric(18, 4) not null,
      "unit" text null,
      "unit_price_net" numeric(18, 2) not null,
      "net_amount" numeric(18, 2) not null,
      "vat_amount" numeric(18, 2) not null,
      "vat_rate" text not null,
      "vat_rate_code" text null,
      "gtu_code" text null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "ksef_invoice_line_items_pkey" primary key ("id"),
      constraint "ksef_invoice_line_items_invoice_fk" foreign key ("invoice_id") references "ksef_invoices" ("id") on delete cascade
    );`)
    this.addSql(`create index "ksef_invoice_line_items_invoice_idx" on "ksef_invoice_line_items" ("invoice_id");`)

    // 3. Add ksef_invoice_id to ksef_submissions and make invoice_id nullable
    this.addSql(`alter table "ksef_submissions" add column "ksef_invoice_id" uuid null;`)
    this.addSql(`create index "ksef_submissions_ksef_invoice_idx" on "ksef_submissions" ("ksef_invoice_id");`)
    this.addSql(`alter table "ksef_submissions" alter column "invoice_id" drop not null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "ksef_submissions" alter column "invoice_id" set not null;`)
    this.addSql(`drop index if exists "ksef_submissions_ksef_invoice_idx";`)
    this.addSql(`alter table "ksef_submissions" drop column if exists "ksef_invoice_id";`)
    this.addSql(`drop table if exists "ksef_invoice_line_items" cascade;`)
    this.addSql(`drop table if exists "ksef_invoices" cascade;`)
  }
}
