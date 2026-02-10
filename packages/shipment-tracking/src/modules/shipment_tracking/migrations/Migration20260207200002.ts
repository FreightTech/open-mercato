import { Migration } from '@mikro-orm/migrations';

export class Migration20260207200002 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "shipment_tracking_carrier_configs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "carrier_name" text not null, "api_endpoint" text null, "auth_config" jsonb null, "rate_limit_requests" int not null default 60, "rate_limit_window_seconds" int not null default 60, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "shipment_tracking_carrier_configs_pkey" primary key ("id"));`);
    this.addSql(`create index "st_carrier_configs_org_tenant_idx" on "shipment_tracking_carrier_configs" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "shipment_tracking_carrier_configs" add constraint "st_carrier_configs_name_uniq" unique ("organization_id", "tenant_id", "carrier_name");`);

    this.addSql(`create table "shipment_tracking_shipments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "status" text not null default 'ORDERED', "carrier_code" text null, "container_number" text null, "booking_number" text null, "bol_number" text null, "etd" timestamptz null, "etd_offset" text null, "eta" timestamptz null, "eta_offset" text null, "atd" timestamptz null, "atd_offset" text null, "ata" timestamptz null, "ata_offset" text null, "origin_name" text null, "origin_unlocode" text null, "origin_country" text null, "destination_name" text null, "destination_unlocode" text null, "destination_country" text null, "vessel_name" text null, "vessel_imo" text null, "event_count" int not null default 0, "extra" jsonb null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, "created_by_user_id" uuid null, constraint "shipment_tracking_shipments_pkey" primary key ("id"));`);
    this.addSql(`create index "st_shipments_carrier_idx" on "shipment_tracking_shipments" ("carrier_code");`);
    this.addSql(`create index "st_shipments_status_idx" on "shipment_tracking_shipments" ("status");`);
    this.addSql(`create index "st_shipments_org_tenant_idx" on "shipment_tracking_shipments" ("organization_id", "tenant_id");`);

    this.addSql(`create table "shipment_tracking_cargo_events" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "shipment_id" uuid not null, "event_id" text not null, "event_type" text not null, "event_code" text not null, "event_classification" text null, "event_date_time" timestamptz not null, "event_date_time_offset" text null, "description" text null, "location_name" text null, "location_unlocode" text null, "location_country" text null, "vessel_name" text null, "vessel_imo" text null, "voyage_number" text null, "raw_data" jsonb null, "created_at" timestamptz not null default now(), constraint "shipment_tracking_cargo_events_pkey" primary key ("id"));`);
    this.addSql(`create index "st_cargo_events_shipment_idx" on "shipment_tracking_cargo_events" ("shipment_id");`);
    this.addSql(`create index "st_cargo_events_org_tenant_idx" on "shipment_tracking_cargo_events" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "shipment_tracking_cargo_events" add constraint "st_cargo_events_event_id_uniq" unique ("shipment_id", "event_id");`);

    this.addSql(`create table "shipment_tracking_jobs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "shipment_id" uuid not null, "carrier_name" text not null, "reference_type" text not null, "reference_value" text not null, "status" text not null default 'active', "schedule" jsonb null, "next_poll_at" timestamptz null, "last_poll_at" timestamptz null, "retry_count" int not null default 0, "error_history" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "shipment_tracking_jobs_pkey" primary key ("id"));`);
    this.addSql(`create index "st_jobs_next_poll_idx" on "shipment_tracking_jobs" ("next_poll_at");`);
    this.addSql(`create index "st_jobs_status_idx" on "shipment_tracking_jobs" ("status");`);
    this.addSql(`create index "st_jobs_org_tenant_idx" on "shipment_tracking_jobs" ("organization_id", "tenant_id");`);

    this.addSql(`create table "shipment_tracking_webhooks" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "url" text not null, "events_subscribed" jsonb not null, "hmac_secret" text null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "shipment_tracking_webhooks_pkey" primary key ("id"));`);
    this.addSql(`create index "st_webhooks_org_tenant_idx" on "shipment_tracking_webhooks" ("organization_id", "tenant_id");`);

    this.addSql(`create table "shipment_tracking_webhook_deliveries" ("id" uuid not null default gen_random_uuid(), "webhook_id" uuid not null, "event_type" text not null, "status" text not null default 'pending', "retry_count" int not null default 0, "next_retry_at" timestamptz null, "payload" jsonb not null, "response_status" int null, "response_body" text null, "error_message" text null, "created_at" timestamptz not null default now(), constraint "shipment_tracking_webhook_deliveries_pkey" primary key ("id"));`);
    this.addSql(`create index "st_webhook_deliveries_next_retry_idx" on "shipment_tracking_webhook_deliveries" ("next_retry_at");`);
    this.addSql(`create index "st_webhook_deliveries_status_idx" on "shipment_tracking_webhook_deliveries" ("status");`);
    this.addSql(`create index "st_webhook_deliveries_webhook_idx" on "shipment_tracking_webhook_deliveries" ("webhook_id");`);

    this.addSql(`alter table "shipment_tracking_cargo_events" add constraint "shipment_tracking_cargo_events_shipment_id_foreign" foreign key ("shipment_id") references "shipment_tracking_shipments" ("id") on update cascade;`);

    this.addSql(`alter table "shipment_tracking_jobs" add constraint "shipment_tracking_jobs_shipment_id_foreign" foreign key ("shipment_id") references "shipment_tracking_shipments" ("id") on update cascade;`);

    this.addSql(`alter table "shipment_tracking_webhook_deliveries" add constraint "shipment_tracking_webhook_deliveries_webhook_id_foreign" foreign key ("webhook_id") references "shipment_tracking_webhooks" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "shipment_tracking_cargo_events" drop constraint "shipment_tracking_cargo_events_shipment_id_foreign";`);

    this.addSql(`alter table "shipment_tracking_jobs" drop constraint "shipment_tracking_jobs_shipment_id_foreign";`);

    this.addSql(`alter table "shipment_tracking_webhook_deliveries" drop constraint "shipment_tracking_webhook_deliveries_webhook_id_foreign";`);

    this.addSql(`drop table if exists "shipment_tracking_webhook_deliveries" cascade;`);

    this.addSql(`drop table if exists "shipment_tracking_webhooks" cascade;`);

    this.addSql(`drop table if exists "shipment_tracking_jobs" cascade;`);

    this.addSql(`drop table if exists "shipment_tracking_cargo_events" cascade;`);

    this.addSql(`drop table if exists "shipment_tracking_shipments" cascade;`);

    this.addSql(`drop table if exists "shipment_tracking_carrier_configs" cascade;`);
  }

}
