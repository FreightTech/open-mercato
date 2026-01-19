import { Migration } from '@mikro-orm/migrations';

/**
 * Migration: Rename fms_files → fms_projects
 *
 * This migration renames the entire fms_files module to fms_projects.
 * The term "file" (Polish: "Teczka") was confusing - "project" better represents
 * a shipment operation.
 *
 * Changes:
 * - Rename tables: fms_files → fms_projects, fms_file_* → fms_project_*
 * - Rename columns: file_number → project_number, file_date → project_date, file_id → project_id
 * - Recreate indexes and foreign keys with new names
 */
export class Migration20260118200000 extends Migration {

  override async up(): Promise<void> {
    // ===========================================================================
    // Step 1: Drop existing foreign key constraints
    // ===========================================================================

    // Drop FK from fms_file_legs to fms_files
    this.addSql(`alter table if exists "fms_file_legs" drop constraint if exists "fms_file_legs_file_id_foreign";`);

    // Drop FK from fms_file_containers to fms_files
    this.addSql(`alter table if exists "fms_file_containers" drop constraint if exists "fms_file_containers_file_id_foreign";`);

    // Drop FK from fms_file_cargo to fms_files
    this.addSql(`alter table if exists "fms_file_cargo" drop constraint if exists "fms_file_cargo_file_id_foreign";`);

    // Drop FK from fms_file_invoices to fms_files
    this.addSql(`alter table if exists "fms_file_invoices" drop constraint if exists "fms_file_invoices_file_id_foreign";`);

    // Drop FK from fms_files to other tables
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_client_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_quote_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_offer_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_origin_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_destination_location_id_foreign";`);

    // Drop FK from fms_file_legs to other tables
    this.addSql(`alter table if exists "fms_file_legs" drop constraint if exists "fms_file_legs_carrier_id_foreign";`);
    this.addSql(`alter table if exists "fms_file_legs" drop constraint if exists "fms_file_legs_origin_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_file_legs" drop constraint if exists "fms_file_legs_destination_location_id_foreign";`);

    // ===========================================================================
    // Step 2: Drop existing indexes
    // ===========================================================================

    // fms_files indexes
    this.addSql(`drop index if exists "fms_files_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_files_workflow_idx";`);
    this.addSql(`drop index if exists "fms_files_status_idx";`);
    this.addSql(`drop index if exists "fms_files_client_idx";`);
    // Drop unique constraint (not index) for file_number
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_number_unique";`);

    // fms_file_legs indexes
    this.addSql(`drop index if exists "fms_file_legs_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_file_legs_file_idx";`);

    // fms_file_containers indexes
    this.addSql(`drop index if exists "fms_file_containers_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_file_containers_file_idx";`);
    this.addSql(`drop index if exists "fms_file_containers_number_idx";`);

    // fms_file_cargo indexes
    this.addSql(`drop index if exists "fms_file_cargo_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_file_cargo_file_idx";`);

    // fms_file_invoices indexes
    this.addSql(`drop index if exists "fms_file_invoices_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_file_invoices_file_idx";`);
    this.addSql(`drop index if exists "fms_file_invoices_document_idx";`);
    this.addSql(`drop index if exists "fms_file_invoices_status_idx";`);

    // ===========================================================================
    // Step 3: Rename columns (before renaming tables)
    // ===========================================================================

    // Rename columns in fms_files
    this.addSql(`alter table "fms_files" rename column "file_number" to "project_number";`);
    this.addSql(`alter table "fms_files" rename column "file_date" to "project_date";`);

    // Rename columns in fms_file_legs
    this.addSql(`alter table "fms_file_legs" rename column "file_id" to "project_id";`);

    // Rename columns in fms_file_containers
    this.addSql(`alter table "fms_file_containers" rename column "file_id" to "project_id";`);

    // Rename columns in fms_file_cargo
    this.addSql(`alter table "fms_file_cargo" rename column "file_id" to "project_id";`);

    // Rename columns in fms_file_invoices
    this.addSql(`alter table "fms_file_invoices" rename column "file_id" to "project_id";`);

    // ===========================================================================
    // Step 4: Rename tables
    // ===========================================================================

    this.addSql(`alter table "fms_files" rename to "fms_projects";`);
    this.addSql(`alter table "fms_file_legs" rename to "fms_project_legs";`);
    this.addSql(`alter table "fms_file_containers" rename to "fms_project_containers";`);
    this.addSql(`alter table "fms_file_cargo" rename to "fms_project_cargo";`);
    this.addSql(`alter table "fms_file_invoices" rename to "fms_project_invoices";`);

    // ===========================================================================
    // Step 5: Recreate indexes with new names
    // ===========================================================================

    // fms_projects indexes
    this.addSql(`create index "fms_projects_org_tenant_idx" on "fms_projects" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_projects_workflow_idx" on "fms_projects" ("workflow_instance_id");`);
    this.addSql(`create index "fms_projects_status_idx" on "fms_projects" ("organization_id", "tenant_id", "current_step");`);
    this.addSql(`create index "fms_projects_client_idx" on "fms_projects" ("client_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_number_unique" unique ("organization_id", "project_number");`);

    // fms_project_legs indexes
    this.addSql(`create index "fms_project_legs_org_tenant_idx" on "fms_project_legs" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_legs_project_idx" on "fms_project_legs" ("project_id", "leg_sequence");`);

    // fms_project_containers indexes
    this.addSql(`create index "fms_project_containers_org_tenant_idx" on "fms_project_containers" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_containers_project_idx" on "fms_project_containers" ("project_id");`);
    this.addSql(`create index "fms_project_containers_number_idx" on "fms_project_containers" ("container_number");`);

    // fms_project_cargo indexes
    this.addSql(`create index "fms_project_cargo_org_tenant_idx" on "fms_project_cargo" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_cargo_project_idx" on "fms_project_cargo" ("project_id");`);

    // fms_project_invoices indexes
    this.addSql(`create index "fms_project_invoices_org_tenant_idx" on "fms_project_invoices" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_invoices_project_idx" on "fms_project_invoices" ("project_id");`);
    this.addSql(`create index "fms_project_invoices_document_idx" on "fms_project_invoices" ("document_id");`);
    this.addSql(`create index "fms_project_invoices_status_idx" on "fms_project_invoices" ("status");`);

    // ===========================================================================
    // Step 6: Recreate foreign key constraints with new names
    // ===========================================================================

    // FK from fms_projects to other tables
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_client_id_foreign" foreign key ("client_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_quote_id_foreign" foreign key ("quote_id") references "fms_quotes" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_offer_id_foreign" foreign key ("offer_id") references "fms_offers" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);

    // FK from fms_project_legs to fms_projects
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_carrier_id_foreign" foreign key ("carrier_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);

    // FK from fms_project_containers to fms_projects
    this.addSql(`alter table "fms_project_containers" add constraint "fms_project_containers_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;`);

    // FK from fms_project_cargo to fms_projects
    this.addSql(`alter table "fms_project_cargo" add constraint "fms_project_cargo_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;`);

    // FK from fms_project_invoices to fms_projects
    this.addSql(`alter table "fms_project_invoices" add constraint "fms_project_invoices_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    // ===========================================================================
    // Reverse Step 6: Drop new foreign key constraints
    // ===========================================================================

    this.addSql(`alter table if exists "fms_project_invoices" drop constraint if exists "fms_project_invoices_project_id_foreign";`);
    this.addSql(`alter table if exists "fms_project_cargo" drop constraint if exists "fms_project_cargo_project_id_foreign";`);
    this.addSql(`alter table if exists "fms_project_containers" drop constraint if exists "fms_project_containers_project_id_foreign";`);
    this.addSql(`alter table if exists "fms_project_legs" drop constraint if exists "fms_project_legs_project_id_foreign";`);
    this.addSql(`alter table if exists "fms_project_legs" drop constraint if exists "fms_project_legs_carrier_id_foreign";`);
    this.addSql(`alter table if exists "fms_project_legs" drop constraint if exists "fms_project_legs_origin_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_project_legs" drop constraint if exists "fms_project_legs_destination_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_projects" drop constraint if exists "fms_projects_client_id_foreign";`);
    this.addSql(`alter table if exists "fms_projects" drop constraint if exists "fms_projects_quote_id_foreign";`);
    this.addSql(`alter table if exists "fms_projects" drop constraint if exists "fms_projects_offer_id_foreign";`);
    this.addSql(`alter table if exists "fms_projects" drop constraint if exists "fms_projects_origin_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_projects" drop constraint if exists "fms_projects_destination_location_id_foreign";`);

    // ===========================================================================
    // Reverse Step 5: Drop new indexes
    // ===========================================================================

    this.addSql(`drop index if exists "fms_projects_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_projects_workflow_idx";`);
    this.addSql(`drop index if exists "fms_projects_status_idx";`);
    this.addSql(`drop index if exists "fms_projects_client_idx";`);
    this.addSql(`alter table "fms_projects" drop constraint if exists "fms_projects_number_unique";`);

    this.addSql(`drop index if exists "fms_project_legs_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_project_legs_project_idx";`);

    this.addSql(`drop index if exists "fms_project_containers_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_project_containers_project_idx";`);
    this.addSql(`drop index if exists "fms_project_containers_number_idx";`);

    this.addSql(`drop index if exists "fms_project_cargo_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_project_cargo_project_idx";`);

    this.addSql(`drop index if exists "fms_project_invoices_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_project_invoices_project_idx";`);
    this.addSql(`drop index if exists "fms_project_invoices_document_idx";`);
    this.addSql(`drop index if exists "fms_project_invoices_status_idx";`);

    // ===========================================================================
    // Reverse Step 4: Rename tables back
    // ===========================================================================

    this.addSql(`alter table "fms_projects" rename to "fms_files";`);
    this.addSql(`alter table "fms_project_legs" rename to "fms_file_legs";`);
    this.addSql(`alter table "fms_project_containers" rename to "fms_file_containers";`);
    this.addSql(`alter table "fms_project_cargo" rename to "fms_file_cargo";`);
    this.addSql(`alter table "fms_project_invoices" rename to "fms_file_invoices";`);

    // ===========================================================================
    // Reverse Step 3: Rename columns back
    // ===========================================================================

    this.addSql(`alter table "fms_files" rename column "project_number" to "file_number";`);
    this.addSql(`alter table "fms_files" rename column "project_date" to "file_date";`);
    this.addSql(`alter table "fms_file_legs" rename column "project_id" to "file_id";`);
    this.addSql(`alter table "fms_file_containers" rename column "project_id" to "file_id";`);
    this.addSql(`alter table "fms_file_cargo" rename column "project_id" to "file_id";`);
    this.addSql(`alter table "fms_file_invoices" rename column "project_id" to "file_id";`);

    // ===========================================================================
    // Reverse Steps 1-2: Recreate original indexes and foreign keys
    // ===========================================================================

    // fms_files indexes
    this.addSql(`create index "fms_files_org_tenant_idx" on "fms_files" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_files_workflow_idx" on "fms_files" ("workflow_instance_id");`);
    this.addSql(`create index "fms_files_status_idx" on "fms_files" ("organization_id", "tenant_id", "current_step");`);
    this.addSql(`create index "fms_files_client_idx" on "fms_files" ("client_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_number_unique" unique ("organization_id", "file_number");`);

    // fms_file_legs indexes
    this.addSql(`create index "fms_file_legs_org_tenant_idx" on "fms_file_legs" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_file_legs_file_idx" on "fms_file_legs" ("file_id", "leg_sequence");`);

    // fms_file_containers indexes
    this.addSql(`create index "fms_file_containers_org_tenant_idx" on "fms_file_containers" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_file_containers_file_idx" on "fms_file_containers" ("file_id");`);
    this.addSql(`create index "fms_file_containers_number_idx" on "fms_file_containers" ("container_number");`);

    // fms_file_cargo indexes
    this.addSql(`create index "fms_file_cargo_org_tenant_idx" on "fms_file_cargo" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_file_cargo_file_idx" on "fms_file_cargo" ("file_id");`);

    // fms_file_invoices indexes
    this.addSql(`create index "fms_file_invoices_org_tenant_idx" on "fms_file_invoices" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_file_invoices_file_idx" on "fms_file_invoices" ("file_id");`);
    this.addSql(`create index "fms_file_invoices_document_idx" on "fms_file_invoices" ("document_id");`);
    this.addSql(`create index "fms_file_invoices_status_idx" on "fms_file_invoices" ("status");`);

    // Recreate foreign keys
    this.addSql(`alter table "fms_files" add constraint "fms_files_client_id_foreign" foreign key ("client_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_quote_id_foreign" foreign key ("quote_id") references "fms_quotes" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_offer_id_foreign" foreign key ("offer_id") references "fms_offers" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_carrier_id_foreign" foreign key ("carrier_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_file_containers" add constraint "fms_file_containers_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "fms_file_cargo" add constraint "fms_file_cargo_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "fms_file_invoices" add constraint "fms_file_invoices_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade on delete cascade;`);
  }
}
