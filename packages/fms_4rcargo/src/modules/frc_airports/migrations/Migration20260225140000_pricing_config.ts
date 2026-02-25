import { Migration } from '@mikro-orm/migrations'

/**
 * Migration for pricing configuration tables:
 * - frc_pricing_config: Default volumetric conversion factors per tenant
 * - frc_carrier_pricing_config: Per-carrier override factors
 */
export class Migration20260225140000_pricing_config extends Migration {
  override async up(): Promise<void> {
    // ============================================
    // 1. frc_pricing_config - Default conversion factors
    // ============================================
    this.addSql(`
      create table "frc_pricing_config" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "air_volumetric_factor" numeric(10,2) not null default 167,
        "sea_volumetric_factor" numeric(10,2) not null default 1000,
        "road_volumetric_factor" numeric(10,2) not null default 333,
        "truck_width_metres" numeric(5,2) not null default 2.4,
        "min_chargeable_weight_kg" numeric(10,2) null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "frc_pricing_config_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index "frc_pricing_config_org_tenant_idx" 
      on "frc_pricing_config" ("organization_id", "tenant_id");
    `)
    this.addSql(`
      alter table "frc_pricing_config" 
      add constraint "frc_pricing_config_scope_unique" 
      unique ("organization_id", "tenant_id");
    `)

    // ============================================
    // 2. frc_carrier_pricing_config - Per-carrier overrides
    // ============================================
    this.addSql(`
      create table "frc_carrier_pricing_config" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "carrier_id" uuid not null,
        "carrier_name" text not null,
        "transport_mode" text not null,
        "volumetric_factor" numeric(10,2) null,
        "min_chargeable_weight_kg" numeric(10,2) null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "frc_carrier_pricing_config_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index "frc_carrier_pricing_org_tenant_idx" 
      on "frc_carrier_pricing_config" ("organization_id", "tenant_id");
    `)
    this.addSql(`
      alter table "frc_carrier_pricing_config" 
      add constraint "frc_carrier_pricing_unique" 
      unique ("organization_id", "tenant_id", "carrier_id");
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "frc_carrier_pricing_config" cascade;`)
    this.addSql(`drop table if exists "frc_pricing_config" cascade;`)
  }
}
