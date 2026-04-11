import { Migration } from '@mikro-orm/migrations'

export class Migration20260409000002 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "documents" (
      "id" uuid not null default gen_random_uuid(),
      "organization_id" uuid not null,
      "tenant_id" uuid not null,
      "name" text not null,
      "category" text not null default 'other',
      "description" text null,
      "attachment_id" uuid not null,
      "related_entity_id" uuid null,
      "related_entity_type" text null,
      "extracted_data" jsonb null,
      "processed_at" timestamptz null,
      "processing_status" text not null default 'pending',
      "retry_count" int not null default 0,
      "last_error" text null,
      "processing_result" jsonb null,
      "consensus_confidence" numeric(3,2) null,
      "consensus_recommendation" text null,
      "document_type" text null,
      "document_type_confidence" int null,
      "document_number" text null,
      "document_date" date null,
      "bl_number" text null,
      "mbl_number" text null,
      "booking_number" text null,
      "container_numbers" jsonb null,
      "vessel_name" text null,
      "voyage_number" text null,
      "port_of_loading" text null,
      "port_of_discharge" text null,
      "currency" text null,
      "seller_name" text null,
      "buyer_name" text null,
      "total_gross_amount" numeric(18,2) null,
      "raw_text" text null,
      "document_data" jsonb null,
      "edited_by" uuid null,
      "edited_at" timestamptz null,
      "parent_document_id" uuid null,
      "created_at" timestamptz not null default now(),
      "created_by" uuid null,
      "updated_at" timestamptz not null default now(),
      "updated_by" uuid null,
      "deleted_at" timestamptz null,
      constraint "documents_pkey" primary key ("id")
    );`)
    this.addSql(`alter table "documents" add constraint "documents_parent_document_id_foreign" foreign key ("parent_document_id") references "documents" ("id") on delete set null;`)
    this.addSql(`create index "documents_scope_idx" on "documents" ("organization_id", "tenant_id");`)
    this.addSql(`create index "documents_category_idx" on "documents" ("category");`)
    this.addSql(`create index "documents_attachment_idx" on "documents" ("attachment_id");`)
    this.addSql(`create index "documents_related_entity_idx" on "documents" ("related_entity_id", "related_entity_type");`)
    this.addSql(`create index "documents_bl_number_idx" on "documents" ("bl_number");`)
    this.addSql(`create index "documents_mbl_number_idx" on "documents" ("mbl_number");`)
    this.addSql(`create index "documents_booking_number_idx" on "documents" ("booking_number");`)
    this.addSql(`create index "documents_parent_idx" on "documents" ("parent_document_id");`)

    this.addSql(`create table "document_pages" (
      "id" uuid not null default gen_random_uuid(),
      "organization_id" uuid not null,
      "tenant_id" uuid not null,
      "document_id" uuid not null,
      "page_number" int not null,
      "storage_path" text not null,
      "storage_driver" text not null default 'local',
      "width" int null,
      "height" int null,
      "file_size" int null,
      "created_at" timestamptz not null default now(),
      constraint "document_pages_pkey" primary key ("id")
    );`)
    this.addSql(`alter table "document_pages" add constraint "document_pages_document_id_foreign" foreign key ("document_id") references "documents" ("id") on delete cascade;`)
    this.addSql(`create index "document_pages_scope_idx" on "document_pages" ("organization_id", "tenant_id");`)
    this.addSql(`create index "document_pages_document_idx" on "document_pages" ("document_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "document_pages" cascade;`)
    this.addSql(`drop table if exists "documents" cascade;`)
  }
}

export default Migration20260409000002
