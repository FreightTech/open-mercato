import { Migration } from '@mikro-orm/migrations';

export class Migration20260209231641 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "fms_locations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "product_type" text not null, "locode" text null, "port_id" uuid null, "lat" double precision null, "lng" double precision null, "city" text null, "country" text null, "contractor_id" uuid null, "address_line1" text null, "address_line2" text null, "state" text null, "postal_code" text null, "is_primary" boolean not null default false, "is_active" boolean not null default true, "google_place_id" text null, "created_at" timestamptz not null, "created_by" uuid null, "updated_at" timestamptz not null, "updated_by" uuid null, "deleted_at" timestamptz null, constraint "fms_locations_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_locations_contractor_idx" on "fms_locations" ("contractor_id");`);
    this.addSql(`create index "fms_locations_type_idx" on "fms_locations" ("product_type");`);
    this.addSql(`create index "fms_locations_scope_idx" on "fms_locations" ("organization_id", "tenant_id");`);
  }

}
