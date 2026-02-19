import { Migration } from '@mikro-orm/migrations';

export class Migration20260208190747 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "shipment_tracking_companies" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "description" text null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "shipment_tracking_companies_pkey" primary key ("id"));`);
    this.addSql(`create index "st_companies_org_tenant_idx" on "shipment_tracking_companies" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "shipment_tracking_companies" add constraint "st_companies_name_uniq" unique ("organization_id", "tenant_id", "name");`);
  }

}
