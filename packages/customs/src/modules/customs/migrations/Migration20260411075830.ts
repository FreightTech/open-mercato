import { Migration } from '@mikro-orm/migrations';

export class Migration20260411075830 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "customs_shipments" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "status" text not null default 'uploading', "bl_number" text null, "invoice_number" text null, "shipper_name" text null, "consignee_name" text null, "loading_port" text null, "discharge_port" text null, "vessel" text null, "shipped_on_board" text null, "product_lines" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "customs_shipments_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_customs_shipments_tenant_org" on "customs_shipments" ("tenant_id", "organization_id");`);

    this.addSql(`create table "customs_consistency_checks" ("id" uuid not null default gen_random_uuid(), "shipment_id" uuid not null, "field" text not null, "label" text not null, "source_doc1" text not null, "source_doc2" text not null, "value1" jsonb null, "value2" jsonb null, "status" text not null, "discrepancy" text null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, constraint "customs_consistency_checks_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_customs_consistency_shipment" on "customs_consistency_checks" ("shipment_id");`);

    this.addSql(`create table "customs_hs_classifications" ("id" uuid not null default gen_random_uuid(), "shipment_id" uuid not null, "line_number" int not null, "product_description" text not null, "ai_suggestions" jsonb not null, "isztar4_results" jsonb null, "selected_hs_code" text null, "selected_description" text null, "selected_duty_rate" text null, "selected_at" timestamptz null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, constraint "customs_hs_classifications_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_customs_hs_class_shipment" on "customs_hs_classifications" ("shipment_id");`);

    this.addSql(`create table "customs_parsed_documents" ("id" uuid not null default gen_random_uuid(), "shipment_id" uuid not null, "document_type" text not null, "file_name" text not null, "file_data" text not null, "extracted" jsonb null, "parse_error" text null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, constraint "customs_parsed_documents_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_customs_parsed_docs_shipment" on "customs_parsed_documents" ("shipment_id");`);

    this.addSql(`alter table "customs_consistency_checks" add constraint "customs_consistency_checks_shipment_id_foreign" foreign key ("shipment_id") references "customs_shipments" ("id") on update cascade;`);

    this.addSql(`alter table "customs_hs_classifications" add constraint "customs_hs_classifications_shipment_id_foreign" foreign key ("shipment_id") references "customs_shipments" ("id") on update cascade;`);

    this.addSql(`alter table "customs_parsed_documents" add constraint "customs_parsed_documents_shipment_id_foreign" foreign key ("shipment_id") references "customs_shipments" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "customs_consistency_checks" drop constraint "customs_consistency_checks_shipment_id_foreign";`);

    this.addSql(`alter table "customs_hs_classifications" drop constraint "customs_hs_classifications_shipment_id_foreign";`);

    this.addSql(`alter table "customs_parsed_documents" drop constraint "customs_parsed_documents_shipment_id_foreign";`);
  }

}
