import { Migration } from '@mikro-orm/migrations';

/**
 * Migration: Create FMS Projects tables
 *
 * This migration creates the FMS Projects module tables.
 * For team members who have the old fms_files tables, they are dropped first.
 *
 * Tables created:
 * - fms_projects
 * - fms_project_legs
 * - fms_project_containers
 * - fms_project_cargo
 * - fms_project_invoices
 */
export class Migration20260118200000 extends Migration {

  override async up(): Promise<void> {
    // ===========================================================================
    // Step 1: Drop old fms_files tables if they exist (for team members with old schema)
    // ===========================================================================

    this.addSql(`drop table if exists "fms_file_invoices" cascade;`);
    this.addSql(`drop table if exists "fms_file_cargo" cascade;`);
    this.addSql(`drop table if exists "fms_file_containers" cascade;`);
    this.addSql(`drop table if exists "fms_file_legs" cascade;`);
    this.addSql(`drop table if exists "fms_files" cascade;`);

    // ===========================================================================
    // Step 2: Create fms_projects table
    // ===========================================================================

    this.addSql(`
      create table "fms_projects" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,

        -- Project identification
        "project_number" text not null,

        -- Relationships
        "client_id" uuid null,
        "quote_id" uuid null,
        "offer_id" uuid null,
        "shipment_id" uuid null,

        -- Workflow integration
        "workflow_instance_id" uuid null,
        "current_step" text null,
        "workflow_context" jsonb null,

        -- Core fields
        "shipment_type" text not null,
        "direction" text not null,
        "cargo_type" text not null,
        "incoterm" text null,

        -- Locations
        "origin_location_id" uuid null,
        "destination_location_id" uuid null,
        "origin_address" text null,
        "destination_address" text null,

        -- Dates
        "project_date" timestamptz not null default now(),
        "requested_pickup_date" timestamptz null,
        "requested_delivery_date" timestamptz null,

        -- References
        "client_reference" text null,
        "internal_reference" text null,

        -- Cargo details
        "commodity_description" text null,
        "hs_code" text null,
        "container_count" integer null,

        -- Total weights/volumes
        "total_gross_weight" numeric(18, 4) null,
        "total_volume" numeric(18, 4) null,
        "weight_unit" text null,
        "volume_unit" text null,

        -- Financial
        "currency_code" text not null default 'USD',
        "estimated_cost" numeric(18, 4) null,

        -- Special requirements
        "requires_insurance" boolean not null default false,
        "requires_customs_brokerage" boolean not null default false,
        "is_hazardous" boolean not null default false,
        "hazmat_details" text null,
        "special_instructions" text null,

        -- Internal notes
        "internal_notes" text null,

        -- Timestamps
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,

        constraint "fms_projects_pkey" primary key ("id")
      );
    `);

    // Create indexes for fms_projects
    this.addSql(`create index if not exists "fms_projects_org_tenant_idx" on "fms_projects" ("organization_id", "tenant_id");`);
    this.addSql(`create index if not exists "fms_projects_workflow_idx" on "fms_projects" ("workflow_instance_id");`);
    this.addSql(`create index if not exists "fms_projects_status_idx" on "fms_projects" ("organization_id", "tenant_id", "current_step");`);
    this.addSql(`create index if not exists "fms_projects_client_idx" on "fms_projects" ("client_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_number_unique" unique ("organization_id", "project_number");`);

    // Create foreign keys for fms_projects
    // Note: quote_id and offer_id FKs are not created here because fms_quotes runs after fms_projects alphabetically
    // Those relationships are enforced at the application level
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_client_id_foreign" foreign key ("client_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);

    // ===========================================================================
    // Step 3: Create fms_project_legs table
    // ===========================================================================

    this.addSql(`
      create table "fms_project_legs" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "project_id" uuid not null,
        "leg_sequence" integer not null,
        "transport_mode" text not null,

        -- Locations
        "origin_location_id" uuid null,
        "destination_location_id" uuid null,
        "origin_address" text null,
        "destination_address" text null,

        -- Carrier information
        "carrier_id" uuid null,
        "carrier_name" text null,
        "vessel_name" text null,
        "voyage_number" text null,
        "flight_number" text null,

        -- Dates
        "estimated_departure" timestamptz null,
        "estimated_arrival" timestamptz null,
        "actual_departure" timestamptz null,
        "actual_arrival" timestamptz null,

        -- Financial
        "estimated_cost" numeric(18, 4) null,
        "actual_cost" numeric(18, 4) null,

        -- Notes
        "notes" text null,

        -- Timestamps
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,

        constraint "fms_project_legs_pkey" primary key ("id")
      );
    `);

    // Create indexes and foreign keys for fms_project_legs
    this.addSql(`create index if not exists "fms_project_legs_org_tenant_idx" on "fms_project_legs" ("organization_id", "tenant_id");`);
    this.addSql(`create index if not exists "fms_project_legs_project_idx" on "fms_project_legs" ("project_id", "leg_sequence");`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_carrier_id_foreign" foreign key ("carrier_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);

    // ===========================================================================
    // Step 4: Create fms_project_containers table
    // ===========================================================================

    this.addSql(`
      create table "fms_project_containers" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "project_id" uuid not null,

        -- Container Info
        "container_type" text not null,
        "container_number" text null,
        "seal_number" text null,
        "ownership_type" text not null default 'coc',

        -- Dimensions
        "length" numeric(18, 4) null,
        "width" numeric(18, 4) null,
        "height" numeric(18, 4) null,
        "dimension_unit" text null,

        -- Weight
        "tare_weight" numeric(18, 4) null,
        "gross_weight" numeric(18, 4) null,
        "net_weight" numeric(18, 4) null,
        "weight_unit" text null,

        -- Cargo
        "commodity_description" text null,
        "package_count" integer null,

        -- Special requirements
        "is_hazardous" boolean not null default false,
        "hazmat_class" text null,
        "un_number" text null,
        "is_reefer" boolean not null default false,
        "temperature_min" numeric(18, 4) null,
        "temperature_max" numeric(18, 4) null,
        "temperature_unit" text null,

        -- Dates
        "pickup_date" timestamptz null,
        "delivery_date" timestamptz null,

        -- Status
        "status" text not null default 'not_ready',
        "notes" text null,

        -- Timestamps
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,

        constraint "fms_project_containers_pkey" primary key ("id")
      );
    `);

    // Create indexes and foreign keys for fms_project_containers
    this.addSql(`create index if not exists "fms_project_containers_org_tenant_idx" on "fms_project_containers" ("organization_id", "tenant_id");`);
    this.addSql(`create index if not exists "fms_project_containers_project_idx" on "fms_project_containers" ("project_id");`);
    this.addSql(`create index if not exists "fms_project_containers_number_idx" on "fms_project_containers" ("container_number");`);
    this.addSql(`alter table "fms_project_containers" add constraint "fms_project_containers_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;`);

    // ===========================================================================
    // Step 5: Create fms_project_cargo table
    // ===========================================================================

    this.addSql(`
      create table "fms_project_cargo" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "project_id" uuid not null,
        "cargo_sequence" integer null,

        -- Description
        "commodity_description" text not null,
        "hs_code" text null,

        -- Packaging
        "package_type" text not null,
        "package_count" integer not null,
        "marks_and_numbers" text null,

        -- Dimensions per piece
        "length" numeric(18, 4) null,
        "width" numeric(18, 4) null,
        "height" numeric(18, 4) null,
        "dimension_unit" text null,

        -- Weight
        "gross_weight" numeric(18, 4) not null,
        "net_weight" numeric(18, 4) null,
        "weight_unit" text not null,

        -- Volume
        "volume" numeric(18, 4) null,
        "volume_unit" text null,

        -- Special requirements
        "is_hazardous" boolean not null default false,
        "hazmat_class" text null,
        "un_number" text null,
        "is_stackable" boolean not null default true,
        "requires_refrigeration" boolean not null default false,
        "temperature_min" numeric(18, 4) null,
        "temperature_max" numeric(18, 4) null,
        "temperature_unit" text null,

        -- Financial
        "declared_value" numeric(18, 4) null,
        "declared_value_currency" text null,

        -- Tracking
        "status" text not null default 'not_ready',

        -- Notes
        "notes" text null,

        -- Timestamps
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,

        constraint "fms_project_cargo_pkey" primary key ("id")
      );
    `);

    // Create indexes and foreign keys for fms_project_cargo
    this.addSql(`create index if not exists "fms_project_cargo_org_tenant_idx" on "fms_project_cargo" ("organization_id", "tenant_id");`);
    this.addSql(`create index if not exists "fms_project_cargo_project_idx" on "fms_project_cargo" ("project_id");`);
    this.addSql(`alter table "fms_project_cargo" add constraint "fms_project_cargo_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;`);

    // ===========================================================================
    // Step 6: Create fms_project_invoices table
    // ===========================================================================

    this.addSql(`
      create table "fms_project_invoices" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "project_id" uuid not null,

        -- Link to the source document
        "document_id" uuid not null,

        -- Extracted invoice data
        "invoice_number" text null,

        -- Seller information
        "seller_name" text null,
        "seller_nip" text null,
        "seller_details" jsonb null,

        -- Buyer information
        "buyer_name" text null,
        "buyer_nip" text null,
        "buyer_details" jsonb null,

        -- Financial totals
        "net_amount" numeric(18, 4) null,
        "vat_amount" numeric(18, 4) null,
        "gross_amount" numeric(18, 4) null,
        "currency_code" text not null default 'PLN',

        -- Dates
        "invoice_date" timestamptz null,
        "payment_due_date" timestamptz null,
        "service_date" timestamptz null,

        -- Payment method
        "payment_method" text null,

        -- Line items
        "line_items" jsonb null,

        -- Extraction metadata
        "confidence" text not null default 'REVIEW',
        "extraction_strategies" jsonb null,
        "raw_extraction_data" jsonb null,

        -- Review status
        "status" text not null default 'pending_review',
        "reviewed_by" uuid null,
        "reviewed_at" timestamptz null,
        "review_notes" text null,

        -- Timestamps
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,

        constraint "fms_project_invoices_pkey" primary key ("id")
      );
    `);

    // Create indexes and foreign keys for fms_project_invoices
    this.addSql(`create index if not exists "fms_project_invoices_org_tenant_idx" on "fms_project_invoices" ("organization_id", "tenant_id");`);
    this.addSql(`create index if not exists "fms_project_invoices_project_idx" on "fms_project_invoices" ("project_id");`);
    this.addSql(`create index if not exists "fms_project_invoices_document_idx" on "fms_project_invoices" ("document_id");`);
    this.addSql(`create index if not exists "fms_project_invoices_status_idx" on "fms_project_invoices" ("status");`);
    this.addSql(`alter table "fms_project_invoices" add constraint "fms_project_invoices_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    // Drop tables in reverse order (due to foreign key dependencies)
    this.addSql(`drop table if exists "fms_project_invoices" cascade;`);
    this.addSql(`drop table if exists "fms_project_cargo" cascade;`);
    this.addSql(`drop table if exists "fms_project_containers" cascade;`);
    this.addSql(`drop table if exists "fms_project_legs" cascade;`);
    this.addSql(`drop table if exists "fms_projects" cascade;`);
  }
}
