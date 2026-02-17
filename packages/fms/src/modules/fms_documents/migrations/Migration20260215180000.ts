import { Migration } from '@mikro-orm/migrations';

export class Migration20260215180000 extends Migration {

  override async up(): Promise<void> {
    // -- Identifiers (real columns, indexed, searchable) --
    this.addSql(`alter table "fms_documents" add column "document_number" text null;`);
    this.addSql(`alter table "fms_documents" add column "document_date" date null;`);
    this.addSql(`alter table "fms_documents" add column "bl_number" text null;`);
    this.addSql(`alter table "fms_documents" add column "booking_number" text null;`);
    this.addSql(`alter table "fms_documents" add column "container_numbers" jsonb null;`);
    this.addSql(`alter table "fms_documents" add column "vessel_name" text null;`);
    this.addSql(`alter table "fms_documents" add column "voyage_number" text null;`);
    this.addSql(`alter table "fms_documents" add column "port_of_loading" text null;`);
    this.addSql(`alter table "fms_documents" add column "port_of_discharge" text null;`);
    this.addSql(`alter table "fms_documents" add column "currency" text null;`);
    this.addSql(`alter table "fms_documents" add column "seller_name" text null;`);
    this.addSql(`alter table "fms_documents" add column "buyer_name" text null;`);
    this.addSql(`alter table "fms_documents" add column "total_gross_amount" numeric(18,2) null;`);

    // -- Data fields --
    this.addSql(`alter table "fms_documents" add column "raw_text" text null;`);
    this.addSql(`alter table "fms_documents" add column "document_data" jsonb null;`);

    // -- Edit tracking --
    this.addSql(`alter table "fms_documents" add column "edited_by" uuid null;`);
    this.addSql(`alter table "fms_documents" add column "edited_at" timestamptz null;`);

    // -- Bundle support --
    this.addSql(`alter table "fms_documents" add column "parent_document_id" uuid null;`);

    // Indexes
    this.addSql(`create index "fms_documents_bl_number_idx" on "fms_documents" ("bl_number");`);
    this.addSql(`create index "fms_documents_booking_number_idx" on "fms_documents" ("booking_number");`);
    this.addSql(`create index "fms_documents_parent_idx" on "fms_documents" ("parent_document_id");`);

    // Foreign key for parent document (self-referencing)
    this.addSql(`alter table "fms_documents" add constraint "fms_documents_parent_document_id_foreign" foreign key ("parent_document_id") references "fms_documents" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fms_documents" drop constraint "fms_documents_parent_document_id_foreign";`);

    this.addSql(`drop index "fms_documents_bl_number_idx";`);
    this.addSql(`drop index "fms_documents_booking_number_idx";`);
    this.addSql(`drop index "fms_documents_parent_idx";`);

    this.addSql(`alter table "fms_documents" drop column "document_number";`);
    this.addSql(`alter table "fms_documents" drop column "document_date";`);
    this.addSql(`alter table "fms_documents" drop column "bl_number";`);
    this.addSql(`alter table "fms_documents" drop column "booking_number";`);
    this.addSql(`alter table "fms_documents" drop column "container_numbers";`);
    this.addSql(`alter table "fms_documents" drop column "vessel_name";`);
    this.addSql(`alter table "fms_documents" drop column "voyage_number";`);
    this.addSql(`alter table "fms_documents" drop column "port_of_loading";`);
    this.addSql(`alter table "fms_documents" drop column "port_of_discharge";`);
    this.addSql(`alter table "fms_documents" drop column "currency";`);
    this.addSql(`alter table "fms_documents" drop column "seller_name";`);
    this.addSql(`alter table "fms_documents" drop column "buyer_name";`);
    this.addSql(`alter table "fms_documents" drop column "total_gross_amount";`);
    this.addSql(`alter table "fms_documents" drop column "raw_text";`);
    this.addSql(`alter table "fms_documents" drop column "document_data";`);
    this.addSql(`alter table "fms_documents" drop column "edited_by";`);
    this.addSql(`alter table "fms_documents" drop column "edited_at";`);
    this.addSql(`alter table "fms_documents" drop column "parent_document_id";`);
  }

}
