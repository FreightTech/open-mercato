import { Migration } from '@mikro-orm/migrations'

/**
 * Adds FA(3) RodzajFaktury-specific fields to `ksef_invoices`, a pre-state
 * flag on line items, and two new child tables required by ZAL/ROZ/KOR_ZAL/
 * KOR_ROZ flows: `ksef_invoice_order_lines` (Zamowienie) and
 * `ksef_invoice_advance_refs` (FakturaZaliczkowa references).
 */
export class Migration20260411153000 extends Migration {
  override async up(): Promise<void> {
    // ksef_invoices: correction metadata
    this.addSql(`alter table "ksef_invoices" add column "corrected_ksef_number" text null;`)
    this.addSql(`alter table "ksef_invoices" add column "corrected_invoice_number" text null;`)
    this.addSql(`alter table "ksef_invoices" add column "corrected_invoice_issue_date" date null;`)
    this.addSql(`alter table "ksef_invoices" add column "correction_effect_type" smallint null;`)
    this.addSql(`alter table "ksef_invoices" add column "correction_period" text null;`)

    // ksef_invoices: advance/order metadata
    this.addSql(`alter table "ksef_invoices" add column "advance_amount" numeric(18,2) null;`)
    this.addSql(`alter table "ksef_invoices" add column "order_total_gross" numeric(18,2) null;`)
    this.addSql(`alter table "ksef_invoices" add column "is_final_advance" boolean not null default false;`)

    // ksef_invoices: foreign currency conversion
    this.addSql(`alter table "ksef_invoices" add column "exchange_rate" numeric(18,6) null;`)
    this.addSql(`alter table "ksef_invoices" add column "exchange_rate_date" date null;`)

    // ksef_invoices: annotation flags
    this.addSql(`alter table "ksef_invoices" add column "annot_cash_accounting" boolean not null default false;`)
    this.addSql(`alter table "ksef_invoices" add column "annot_self_billing" boolean not null default false;`)
    this.addSql(`alter table "ksef_invoices" add column "annot_reverse_charge" boolean not null default false;`)
    this.addSql(`alter table "ksef_invoices" add column "annot_split_payment" boolean not null default false;`)
    this.addSql(`alter table "ksef_invoices" add column "annot_intra_community_supply" boolean not null default false;`)
    this.addSql(`alter table "ksef_invoices" add column "annot_export_of_services" boolean not null default false;`)
    this.addSql(`alter table "ksef_invoices" add column "annot_new_transport_means" boolean not null default false;`)

    // ksef_invoice_line_items: StanPrzed flag for KOR method 2
    this.addSql(`alter table "ksef_invoice_line_items" add column "is_pre_state" boolean not null default false;`)

    // ksef_invoice_order_lines (Zamowienie / ZamowienieWiersz)
    this.addSql(`create table "ksef_invoice_order_lines" (
      "id" uuid not null default gen_random_uuid(),
      "invoice_id" uuid not null,
      "line_number" int not null,
      "description" text not null,
      "unit" text null,
      "quantity" numeric(18,4) not null,
      "net_amount" numeric(18,2) not null,
      "vat_amount" numeric(18,2) not null,
      "vat_rate" text not null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "ksef_invoice_order_lines_pkey" primary key ("id"),
      constraint "ksef_invoice_order_lines_invoice_fk" foreign key ("invoice_id")
        references "ksef_invoices" ("id") on delete cascade
    );`)
    this.addSql(`create index "ksef_invoice_order_lines_invoice_idx" on "ksef_invoice_order_lines" ("invoice_id");`)

    // ksef_invoice_advance_refs (FakturaZaliczkowa references)
    this.addSql(`create table "ksef_invoice_advance_refs" (
      "id" uuid not null default gen_random_uuid(),
      "invoice_id" uuid not null,
      "ksef_number" text null,
      "invoice_number" text null,
      "issue_date" date null,
      "advance_amount" numeric(18,2) null,
      "created_at" timestamptz not null default now(),
      constraint "ksef_invoice_advance_refs_pkey" primary key ("id"),
      constraint "ksef_invoice_advance_refs_invoice_fk" foreign key ("invoice_id")
        references "ksef_invoices" ("id") on delete cascade,
      constraint "ksef_invoice_advance_refs_ref_chk"
        check (("ksef_number" is not null) or ("invoice_number" is not null))
    );`)
    this.addSql(`create index "ksef_invoice_advance_refs_invoice_idx" on "ksef_invoice_advance_refs" ("invoice_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ksef_invoice_advance_refs" cascade;`)
    this.addSql(`drop table if exists "ksef_invoice_order_lines" cascade;`)

    this.addSql(`alter table "ksef_invoice_line_items" drop column if exists "is_pre_state";`)

    this.addSql(`alter table "ksef_invoices" drop column if exists "annot_new_transport_means";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "annot_export_of_services";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "annot_intra_community_supply";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "annot_split_payment";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "annot_reverse_charge";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "annot_self_billing";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "annot_cash_accounting";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "exchange_rate_date";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "exchange_rate";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "is_final_advance";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "order_total_gross";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "advance_amount";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "correction_period";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "correction_effect_type";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "corrected_invoice_issue_date";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "corrected_invoice_number";`)
    this.addSql(`alter table "ksef_invoices" drop column if exists "corrected_ksef_number";`)
  }
}

export default Migration20260411153000
