import { Migration } from '@mikro-orm/migrations'

export class Migration20260129120000 extends Migration {
  override async up(): Promise<void> {
    // Add new columns for contractor address support
    this.addSql(`
      alter table "fms_locations"
      add column "contractor_id" uuid null,
      add column "address_line1" text null,
      add column "address_line2" text null,
      add column "state" text null,
      add column "postal_code" text null,
      add column "is_primary" boolean not null default false,
      add column "is_active" boolean not null default true,
      add column "google_place_id" text null;
    `)

    // Create index on contractor_id for faster lookups
    this.addSql(`
      create index "fms_locations_contractor_idx" on "fms_locations" ("contractor_id");
    `)

    // Add foreign key constraint to contractors table
    this.addSql(`
      alter table "fms_locations"
      add constraint "fms_locations_contractor_id_fkey"
      foreign key ("contractor_id") references "contractors" ("id")
      on delete set null;
    `)
  }

  override async down(): Promise<void> {
    // Remove foreign key constraint
    this.addSql(`
      alter table "fms_locations"
      drop constraint if exists "fms_locations_contractor_id_fkey";
    `)

    // Remove index
    this.addSql(`drop index if exists "fms_locations_contractor_idx";`)

    // Remove columns
    this.addSql(`
      alter table "fms_locations"
      drop column if exists "contractor_id",
      drop column if exists "address_line1",
      drop column if exists "address_line2",
      drop column if exists "state",
      drop column if exists "postal_code",
      drop column if exists "is_primary",
      drop column if exists "is_active",
      drop column if exists "google_place_id";
    `)
  }
}
