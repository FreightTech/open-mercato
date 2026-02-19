import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Create shipment_tracking_bic_configs table
 * 
 * This table stores per-tenant BIC Facility API credentials for location
 * data enrichment (coordinates, addresses, operator names).
 */
export class Migration20260219100003 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE "shipment_tracking_bic_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT false,
        "username" text NOT NULL DEFAULT '',
        "password" text NOT NULL DEFAULT '',
        "base_url" text NOT NULL DEFAULT 'https://api.bic-code.org',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "shipment_tracking_bic_configs_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "st_bic_configs_scope_unique" UNIQUE ("organization_id", "tenant_id")
      )
    `)

    this.addSql(`
      CREATE INDEX "st_bic_configs_org_tenant_idx" 
        ON "shipment_tracking_bic_configs" ("organization_id", "tenant_id")
    `)
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "shipment_tracking_bic_configs"')
  }
}
