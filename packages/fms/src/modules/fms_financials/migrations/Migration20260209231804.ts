import { Migration } from '@mikro-orm/migrations';

export class Migration20260209231804 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_invoices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_number" text null, "invoice_date" date null, "due_date" date null, "service_date" date null, "seller_name" text null, "seller_tax_id" text null, "seller_address" text null, "buyer_name" text null, "buyer_tax_id" text null, "buyer_address" text null, "net_amount" numeric(18,2) not null default '0', "vat_amount" numeric(18,2) not null default '0', "gross_amount" numeric(18,2) not null default '0', "currency_code" text not null default 'PLN', "attachment_id" uuid null, "original_filename" text null, "extracted_data" jsonb null, "extraction_confidence" text null, "processed_at" timestamptz null, "document_type" text not null default 'invoice', "document_type_confidence" int null, "transportation_metadata" jsonb null, "bl_number" text null, "container_numbers" jsonb null, "vessel_name" text null, "voyage_number" text null, "custom_reference" text null, "status" text not null default 'pending_review', "reviewed_by" uuid null, "reviewed_at" timestamptz null, "review_notes" text null, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_invoices_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_invoices_bl_number_idx" on "fms_invoices" ("bl_number");`);
    this.addSql(`create index "fms_invoices_date_idx" on "fms_invoices" ("organization_id", "tenant_id", "invoice_date");`);
    this.addSql(`create index "fms_invoices_seller_idx" on "fms_invoices" ("organization_id", "tenant_id", "seller_name");`);
    this.addSql(`create index "fms_invoices_status_idx" on "fms_invoices" ("organization_id", "tenant_id", "status");`);
    this.addSql(`create index "fms_invoices_scope_idx" on "fms_invoices" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_invoice_pages" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_id" uuid not null, "page_number" int not null, "storage_path" text not null, "storage_driver" text not null default 'local', "width" int null, "height" int null, "file_size" int null, "extracted_text" text null, "created_at" timestamptz not null, constraint "fms_invoice_pages_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_invoice_pages_invoice_idx" on "fms_invoice_pages" ("invoice_id");`);
    this.addSql(`create index "fms_invoice_pages_scope_idx" on "fms_invoice_pages" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_invoice_line_items" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_id" uuid not null, "line_number" int not null, "description" text not null, "quantity" numeric(18,4) not null default '1', "unit" text null, "unit_price_net" numeric(18,4) not null default '0', "vat_rate" numeric(5,2) not null default '0', "net_amount" numeric(18,2) not null default '0', "vat_amount" numeric(18,2) not null default '0', "gross_amount" numeric(18,2) not null default '0', "product_id" uuid null, "charge_code_match_confidence" int null, "raw_description" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "fms_invoice_line_items_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_invoice_line_items_product_idx" on "fms_invoice_line_items" ("product_id");`);
    this.addSql(`create index "fms_invoice_line_items_invoice_idx" on "fms_invoice_line_items" ("invoice_id");`);
    this.addSql(`create index "fms_invoice_line_items_scope_idx" on "fms_invoice_line_items" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "fms_invoice_pages" add constraint "fms_invoice_pages_invoice_id_foreign" foreign key ("invoice_id") references "fms_invoices" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "fms_invoice_line_items" add constraint "fms_invoice_line_items_invoice_id_foreign" foreign key ("invoice_id") references "fms_invoices" ("id") on update cascade on delete cascade;`);
  }

}
