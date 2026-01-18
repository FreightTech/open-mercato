import { Migration } from '@mikro-orm/migrations';

/**
 * Migration: Rename fms_booking tables to fms_files
 *
 * This migration renames the booking-related tables to file-related names
 * to align with industry terminology where "File" (Polish: "Teczka")
 * is used for active shipments.
 *
 * Table renames:
 * - fms_bookings -> fms_files
 * - fms_booking_legs -> fms_file_legs
 * - fms_booking_containers -> fms_file_containers
 * - fms_booking_cargo -> fms_file_cargo
 *
 * Column renames:
 * - booking_id -> file_id (in child tables)
 * - booking_number -> file_number
 * - booking_date -> file_date
 */
export class Migration20260117230000 extends Migration {

  override async up(): Promise<void> {
    // Drop foreign key constraints first
    this.addSql(`alter table if exists "fms_booking_cargo" drop constraint if exists "fms_booking_cargo_booking_id_foreign";`);
    this.addSql(`alter table if exists "fms_booking_containers" drop constraint if exists "fms_booking_containers_booking_id_foreign";`);
    this.addSql(`alter table if exists "fms_booking_legs" drop constraint if exists "fms_booking_legs_booking_id_foreign";`);
    this.addSql(`alter table if exists "fms_booking_legs" drop constraint if exists "fms_booking_legs_carrier_id_foreign";`);
    this.addSql(`alter table if exists "fms_booking_legs" drop constraint if exists "fms_booking_legs_origin_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_booking_legs" drop constraint if exists "fms_booking_legs_destination_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_bookings" drop constraint if exists "fms_bookings_client_id_foreign";`);
    this.addSql(`alter table if exists "fms_bookings" drop constraint if exists "fms_bookings_quote_id_foreign";`);
    this.addSql(`alter table if exists "fms_bookings" drop constraint if exists "fms_bookings_offer_id_foreign";`);
    this.addSql(`alter table if exists "fms_bookings" drop constraint if exists "fms_bookings_origin_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_bookings" drop constraint if exists "fms_bookings_destination_location_id_foreign";`);

    // Drop unique constraints
    this.addSql(`alter table if exists "fms_bookings" drop constraint if exists "fms_bookings_number_unique";`);

    // Drop indexes on child tables
    this.addSql(`drop index if exists "fms_booking_cargo_booking_idx";`);
    this.addSql(`drop index if exists "fms_booking_cargo_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_booking_containers_number_idx";`);
    this.addSql(`drop index if exists "fms_booking_containers_booking_idx";`);
    this.addSql(`drop index if exists "fms_booking_containers_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_booking_legs_booking_idx";`);
    this.addSql(`drop index if exists "fms_booking_legs_org_tenant_idx";`);

    // Drop indexes on main table
    this.addSql(`drop index if exists "fms_bookings_client_idx";`);
    this.addSql(`drop index if exists "fms_bookings_status_idx";`);
    this.addSql(`drop index if exists "fms_bookings_workflow_idx";`);
    this.addSql(`drop index if exists "fms_bookings_org_tenant_idx";`);

    // Rename columns in main table
    this.addSql(`alter table "fms_bookings" rename column "booking_number" to "file_number";`);
    this.addSql(`alter table "fms_bookings" rename column "booking_date" to "file_date";`);

    // Rename columns in child tables
    this.addSql(`alter table "fms_booking_legs" rename column "booking_id" to "file_id";`);
    this.addSql(`alter table "fms_booking_containers" rename column "booking_id" to "file_id";`);
    this.addSql(`alter table "fms_booking_cargo" rename column "booking_id" to "file_id";`);

    // Rename tables
    this.addSql(`alter table "fms_bookings" rename to "fms_files";`);
    this.addSql(`alter table "fms_booking_legs" rename to "fms_file_legs";`);
    this.addSql(`alter table "fms_booking_containers" rename to "fms_file_containers";`);
    this.addSql(`alter table "fms_booking_cargo" rename to "fms_file_cargo";`);

    // Rename primary key constraints
    this.addSql(`alter table "fms_files" rename constraint "fms_bookings_pkey" to "fms_files_pkey";`);
    this.addSql(`alter table "fms_file_legs" rename constraint "fms_booking_legs_pkey" to "fms_file_legs_pkey";`);
    this.addSql(`alter table "fms_file_containers" rename constraint "fms_booking_containers_pkey" to "fms_file_containers_pkey";`);
    this.addSql(`alter table "fms_file_cargo" rename constraint "fms_booking_cargo_pkey" to "fms_file_cargo_pkey";`);

    // Recreate indexes on main table
    this.addSql(`create index "fms_files_org_tenant_idx" on "fms_files" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_files_workflow_idx" on "fms_files" ("workflow_instance_id");`);
    this.addSql(`create index "fms_files_status_idx" on "fms_files" ("organization_id", "tenant_id", "current_step");`);
    this.addSql(`create index "fms_files_client_idx" on "fms_files" ("client_id", "organization_id", "tenant_id");`);

    // Recreate indexes on child tables
    this.addSql(`create index "fms_file_legs_file_idx" on "fms_file_legs" ("file_id", "leg_sequence");`);
    this.addSql(`create index "fms_file_legs_org_tenant_idx" on "fms_file_legs" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_file_containers_number_idx" on "fms_file_containers" ("container_number");`);
    this.addSql(`create index "fms_file_containers_file_idx" on "fms_file_containers" ("file_id");`);
    this.addSql(`create index "fms_file_containers_org_tenant_idx" on "fms_file_containers" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_file_cargo_file_idx" on "fms_file_cargo" ("file_id");`);
    this.addSql(`create index "fms_file_cargo_org_tenant_idx" on "fms_file_cargo" ("organization_id", "tenant_id");`);

    // Recreate unique constraint
    this.addSql(`alter table "fms_files" add constraint "fms_files_number_unique" unique ("organization_id", "file_number");`);

    // Recreate foreign key constraints on main table
    this.addSql(`alter table "fms_files" add constraint "fms_files_client_id_foreign" foreign key ("client_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_quote_id_foreign" foreign key ("quote_id") references "fms_quotes" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_offer_id_foreign" foreign key ("offer_id") references "fms_offers" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_files" add constraint "fms_files_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);

    // Recreate foreign key constraints on child tables
    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade;`);
    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_file_legs" add constraint "fms_file_legs_carrier_id_foreign" foreign key ("carrier_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_file_containers" add constraint "fms_file_containers_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade;`);
    this.addSql(`alter table "fms_file_cargo" add constraint "fms_file_cargo_file_id_foreign" foreign key ("file_id") references "fms_files" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    // Drop foreign key constraints first
    this.addSql(`alter table if exists "fms_file_cargo" drop constraint if exists "fms_file_cargo_file_id_foreign";`);
    this.addSql(`alter table if exists "fms_file_containers" drop constraint if exists "fms_file_containers_file_id_foreign";`);
    this.addSql(`alter table if exists "fms_file_legs" drop constraint if exists "fms_file_legs_file_id_foreign";`);
    this.addSql(`alter table if exists "fms_file_legs" drop constraint if exists "fms_file_legs_carrier_id_foreign";`);
    this.addSql(`alter table if exists "fms_file_legs" drop constraint if exists "fms_file_legs_origin_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_file_legs" drop constraint if exists "fms_file_legs_destination_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_client_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_quote_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_offer_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_origin_location_id_foreign";`);
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_destination_location_id_foreign";`);

    // Drop unique constraints
    this.addSql(`alter table if exists "fms_files" drop constraint if exists "fms_files_number_unique";`);

    // Drop indexes on child tables
    this.addSql(`drop index if exists "fms_file_cargo_file_idx";`);
    this.addSql(`drop index if exists "fms_file_cargo_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_file_containers_number_idx";`);
    this.addSql(`drop index if exists "fms_file_containers_file_idx";`);
    this.addSql(`drop index if exists "fms_file_containers_org_tenant_idx";`);
    this.addSql(`drop index if exists "fms_file_legs_file_idx";`);
    this.addSql(`drop index if exists "fms_file_legs_org_tenant_idx";`);

    // Drop indexes on main table
    this.addSql(`drop index if exists "fms_files_client_idx";`);
    this.addSql(`drop index if exists "fms_files_status_idx";`);
    this.addSql(`drop index if exists "fms_files_workflow_idx";`);
    this.addSql(`drop index if exists "fms_files_org_tenant_idx";`);

    // Rename tables back
    this.addSql(`alter table "fms_files" rename to "fms_bookings";`);
    this.addSql(`alter table "fms_file_legs" rename to "fms_booking_legs";`);
    this.addSql(`alter table "fms_file_containers" rename to "fms_booking_containers";`);
    this.addSql(`alter table "fms_file_cargo" rename to "fms_booking_cargo";`);

    // Rename columns back
    this.addSql(`alter table "fms_bookings" rename column "file_number" to "booking_number";`);
    this.addSql(`alter table "fms_bookings" rename column "file_date" to "booking_date";`);
    this.addSql(`alter table "fms_booking_legs" rename column "file_id" to "booking_id";`);
    this.addSql(`alter table "fms_booking_containers" rename column "file_id" to "booking_id";`);
    this.addSql(`alter table "fms_booking_cargo" rename column "file_id" to "booking_id";`);

    // Rename primary key constraints back
    this.addSql(`alter table "fms_bookings" rename constraint "fms_files_pkey" to "fms_bookings_pkey";`);
    this.addSql(`alter table "fms_booking_legs" rename constraint "fms_file_legs_pkey" to "fms_booking_legs_pkey";`);
    this.addSql(`alter table "fms_booking_containers" rename constraint "fms_file_containers_pkey" to "fms_booking_containers_pkey";`);
    this.addSql(`alter table "fms_booking_cargo" rename constraint "fms_file_cargo_pkey" to "fms_booking_cargo_pkey";`);

    // Recreate indexes on main table
    this.addSql(`create index "fms_bookings_org_tenant_idx" on "fms_bookings" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_bookings_workflow_idx" on "fms_bookings" ("workflow_instance_id");`);
    this.addSql(`create index "fms_bookings_status_idx" on "fms_bookings" ("organization_id", "tenant_id", "current_step");`);
    this.addSql(`create index "fms_bookings_client_idx" on "fms_bookings" ("client_id", "organization_id", "tenant_id");`);

    // Recreate indexes on child tables
    this.addSql(`create index "fms_booking_legs_booking_idx" on "fms_booking_legs" ("booking_id", "leg_sequence");`);
    this.addSql(`create index "fms_booking_legs_org_tenant_idx" on "fms_booking_legs" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_booking_containers_number_idx" on "fms_booking_containers" ("container_number");`);
    this.addSql(`create index "fms_booking_containers_booking_idx" on "fms_booking_containers" ("booking_id");`);
    this.addSql(`create index "fms_booking_containers_org_tenant_idx" on "fms_booking_containers" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_booking_cargo_booking_idx" on "fms_booking_cargo" ("booking_id");`);
    this.addSql(`create index "fms_booking_cargo_org_tenant_idx" on "fms_booking_cargo" ("organization_id", "tenant_id");`);

    // Recreate unique constraint
    this.addSql(`alter table "fms_bookings" add constraint "fms_bookings_number_unique" unique ("organization_id", "booking_number");`);

    // Recreate foreign key constraints
    this.addSql(`alter table "fms_bookings" add constraint "fms_bookings_client_id_foreign" foreign key ("client_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_bookings" add constraint "fms_bookings_quote_id_foreign" foreign key ("quote_id") references "fms_quotes" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_bookings" add constraint "fms_bookings_offer_id_foreign" foreign key ("offer_id") references "fms_offers" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_bookings" add constraint "fms_bookings_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_bookings" add constraint "fms_bookings_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_booking_legs" add constraint "fms_booking_legs_booking_id_foreign" foreign key ("booking_id") references "fms_bookings" ("id") on update cascade;`);
    this.addSql(`alter table "fms_booking_legs" add constraint "fms_booking_legs_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_booking_legs" add constraint "fms_booking_legs_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_booking_legs" add constraint "fms_booking_legs_carrier_id_foreign" foreign key ("carrier_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_booking_containers" add constraint "fms_booking_containers_booking_id_foreign" foreign key ("booking_id") references "fms_bookings" ("id") on update cascade;`);
    this.addSql(`alter table "fms_booking_cargo" add constraint "fms_booking_cargo_booking_id_foreign" foreign key ("booking_id") references "fms_bookings" ("id") on update cascade;`);
  }
}
