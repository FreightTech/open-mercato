import { Migration } from '@mikro-orm/migrations';

export class Migration20260220091612 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "shipment_tracking_location_overrides" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "carrier_code" text null, "unlocode" text not null, "facility_code" text not null, "facility_code_list_provider" text not null, "override_data" jsonb not null, "description" text null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, "created_by_user_id" uuid null, "updated_by_user_id" uuid null, constraint "shipment_tracking_location_overrides_pkey" primary key ("id"));`);
    this.addSql(`create index "st_location_overrides_lookup_idx" on "shipment_tracking_location_overrides" ("unlocode", "facility_code", "facility_code_list_provider");`);
    this.addSql(`create index "st_location_overrides_org_tenant_idx" on "shipment_tracking_location_overrides" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "shipment_tracking_location_overrides" add constraint "st_location_overrides_match_uniq" unique ("organization_id", "tenant_id", "carrier_code", "unlocode", "facility_code", "facility_code_list_provider");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "shipment_tracking_events" drop column "facility_address";`);
    this.addSql(`DROP INDEX IF EXISTS "st_location_overrides_lookup_idx";`);
    this.addSql(`DROP INDEX IF EXISTS "st_location_overrides_org_tenant_idx";`);
    this.addSql('DROP TABLE IF EXISTS "shipment_tracking_location_overrides"')
  }
}
