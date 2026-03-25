import { Migration } from '@mikro-orm/migrations';

export class Migration20260325135126 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_file_invoices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "file_id" uuid not null, "document_id" uuid null, "invoice_number" text null, "seller_name" text null, "seller_nip" text null, "buyer_name" text null, "buyer_nip" text null, "seller_details" jsonb null, "buyer_details" jsonb null, "net_amount" numeric(18,4) null, "vat_amount" numeric(18,4) null, "gross_amount" numeric(18,4) null, "currency_code" text not null default 'PLN', "invoice_date" timestamptz null, "payment_due_date" timestamptz null, "service_date" timestamptz null, "payment_method" text null, "line_items" jsonb null, "confidence" text not null default 'REVIEW', "extraction_strategies" jsonb null, "raw_extraction_data" jsonb null, "status" text not null default 'pending_review', "reviewed_by" uuid null, "reviewed_at" timestamptz null, "review_notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_file_invoices_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_file_invoices_status_idx" on "fms_file_invoices" ("status");`);
    this.addSql(`create index "fms_file_invoices_document_idx" on "fms_file_invoices" ("document_id");`);
    this.addSql(`create index "fms_file_invoices_file_idx" on "fms_file_invoices" ("file_id");`);
    this.addSql(`create index "fms_file_invoices_org_tenant_idx" on "fms_file_invoices" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "fms_file_invoices" add constraint "fms_file_invoices_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_file_invoices" drop constraint "fms_file_invoices_file_id_foreign";`);
    this.addSql(`drop table if exists "fms_file_invoices";`);
  }

}
