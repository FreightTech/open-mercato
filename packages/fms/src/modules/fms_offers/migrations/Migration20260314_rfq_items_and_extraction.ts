import { Migration } from '@mikro-orm/migrations';

export class Migration20260314_rfq_items_and_extraction extends Migration {

  override async up(): Promise<void> {
    // Add extraction-related columns to fms_rfqs
    this.addSql(`alter table "fms_rfqs" add column if not exists "raw_text" text null;`);
    this.addSql(`alter table "fms_rfqs" add column if not exists "sender_email" text null;`);
    this.addSql(`alter table "fms_rfqs" add column if not exists "sender_name" text null;`);
    this.addSql(`alter table "fms_rfqs" add column if not exists "extracted_data" jsonb null;`);
    this.addSql(`alter table "fms_rfqs" add column if not exists "highlights" jsonb null;`);

    // Create fms_rfq_items table
    this.addSql(`create table if not exists "fms_rfq_items" ("id" uuid not null default gen_random_uuid(), "rfq_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "item_number" integer not null default 1, "container_type" text null, "container_count" integer null, "origin" text null, "destination" text null, "origin_location_id" uuid null, "destination_location_id" uuid null, "cargo_description" text null, "weight_kg" numeric(18,4) null, "readiness_date" text null, "incoterm" text null, "transport_mode" text null, "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "fms_rfq_items_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fms_rfq_items_rfq_idx" on "fms_rfq_items" ("rfq_id", "organization_id", "tenant_id");`);
    this.addSql(`do $$ begin alter table "fms_rfq_items" add constraint "fms_rfq_items_rfq_id_fkey" foreign key ("rfq_id") references "fms_rfqs" ("id") on delete cascade; exception when duplicate_object then null; end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fms_rfq_items" cascade;`);
    this.addSql(`alter table "fms_rfqs" drop column if exists "raw_text";`);
    this.addSql(`alter table "fms_rfqs" drop column if exists "sender_email";`);
    this.addSql(`alter table "fms_rfqs" drop column if exists "sender_name";`);
    this.addSql(`alter table "fms_rfqs" drop column if exists "extracted_data";`);
    this.addSql(`alter table "fms_rfqs" drop column if exists "highlights";`);
  }

}
