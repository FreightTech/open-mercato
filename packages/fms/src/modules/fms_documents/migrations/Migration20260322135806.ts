import { Migration } from '@mikro-orm/migrations';

export class Migration20260322135806 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_invoice_cost_allocations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_id" uuid not null, "invoice_line_item_id" uuid not null, "project_id" uuid not null, "project_line_id" uuid not null, "amount" numeric(18,2) not null default '0', "currency_code" text not null default 'PLN', "status" text not null default 'pending', "allocated_by" uuid null, "allocated_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "fms_invoice_cost_allocations_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_invoice_cost_alloc_project_line_idx" on "fms_invoice_cost_allocations" ("project_line_id");`);
    this.addSql(`create index "fms_invoice_cost_alloc_project_idx" on "fms_invoice_cost_allocations" ("project_id");`);
    this.addSql(`create index "fms_invoice_cost_alloc_invoice_idx" on "fms_invoice_cost_allocations" ("invoice_id");`);
    this.addSql(`create index "fms_invoice_cost_alloc_scope_idx" on "fms_invoice_cost_allocations" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "fms_invoice_cost_allocations" add constraint "fms_invoice_cost_allocations_invoice_id_foreign" foreign key ("invoice_id") references "fms_invoices" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "fms_invoice_cost_allocations" add constraint "fms_invoice_cost_allocations_invoice_line_item_id_foreign" foreign key ("invoice_line_item_id") references "fms_invoice_line_items" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "fms_invoices" add column "invoice_type" text null, add column "expense_category" text null, add column "expense_note" text null, add column "document_id" uuid null, add column "seller_contractor_id" uuid null, add column "buyer_contractor_id" uuid null;`);
    this.addSql(`create index "fms_invoices_invoice_type_idx" on "fms_invoices" ("invoice_type");`);
    this.addSql(`create index "fms_invoices_document_id_idx" on "fms_invoices" ("document_id");`);
    this.addSql(`create index "fms_invoices_seller_contractor_idx" on "fms_invoices" ("seller_contractor_id");`);

    this.addSql(`alter table "fms_invoice_line_items" add column "is_excluded" boolean not null default false, add column "is_manually_added" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "fms_invoices_invoice_type_idx";`);
    this.addSql(`drop index "fms_invoices_document_id_idx";`);
    this.addSql(`drop index "fms_invoices_seller_contractor_idx";`);
    this.addSql(`alter table "fms_invoices" drop column "invoice_type", drop column "expense_category", drop column "expense_note", drop column "document_id", drop column "seller_contractor_id", drop column "buyer_contractor_id";`);

    this.addSql(`alter table "fms_invoice_line_items" drop column "is_excluded", drop column "is_manually_added";`);
  }

}
