import { Migration } from '@mikro-orm/migrations'

/**
 * Migration for frc_settings module tables:
 * - frc_offer_templates: Offer email templates with merge fields
 * - frc_sugarcrm_config: SugarCRM integration configuration
 */
export class Migration20260219170000_frc_settings extends Migration {
  override async up(): Promise<void> {
    // ============================================
    // 1. frc_offer_templates
    // ============================================
    this.addSql(`
      create table "frc_offer_templates" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "name" text not null,
        "description" text null,
        "subject_template" text not null,
        "content_template" text not null,
        "is_default" boolean not null default false,
        "is_active" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "frc_offer_templates_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index "frc_offer_templates_org_tenant_idx" 
      on "frc_offer_templates" ("organization_id", "tenant_id");
    `)

    // ============================================
    // 2. frc_sugarcrm_config
    // ============================================
    this.addSql(`
      create table "frc_sugarcrm_config" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "instance_url" text null,
        "api_key" text null,
        "is_enabled" boolean not null default false,
        "last_sync_at" timestamptz null,
        "last_sync_status" text null,
        "last_sync_message" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "frc_sugarcrm_config_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index "frc_sugarcrm_config_org_tenant_idx" 
      on "frc_sugarcrm_config" ("organization_id", "tenant_id");
    `)
    this.addSql(`
      alter table "frc_sugarcrm_config" 
      add constraint "frc_sugarcrm_config_scope_unique" 
      unique ("organization_id", "tenant_id");
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "frc_sugarcrm_config" cascade;`)
    this.addSql(`drop table if exists "frc_offer_templates" cascade;`)
  }
}
