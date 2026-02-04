import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Add CargoWise-aligned fields to FmsProject and FmsSeaContainer
 *
 * This migration adds ~45 new fields across both entities to support
 * CargoWise data structures including:
 * - Container mode, service level, B/L details
 * - Party relationships (notify, controlling agent/customer, sending/receiving agents, creditor)
 * - Cargo valuation (goods value, insurance value)
 * - Packing details, measurements, cargo identification
 * - B/L status, voyage details, cut-off dates
 * - Pickup/delivery planning fields
 */
export class Migration20260125180000 extends Migration {
  override async up(): Promise<void> {
    // ============================================================================
    // FmsProject - Add CargoWise-aligned fields (~20 fields)
    // ============================================================================

    // Container & service configuration
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "container_mode" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "service_level" text NULL;`)

    // Bill of Lading details
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "bl_number" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "bl_type" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "release_type" text NULL;`)

    // Party relationships (FKs to contractors)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "notify_party_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "controlling_agent_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "controlling_customer_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "sending_agent_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "receiving_agent_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "agents_reference" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "creditor_id" uuid NULL;`)

    // Cargo valuation
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "goods_value" numeric(18,2) NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "goods_value_currency" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "insurance_value" numeric(18,2) NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "insurance_value_currency" text NULL;`)

    // Status & terms
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "is_domestic" boolean NOT NULL DEFAULT false;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "additional_terms" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "payment_terms" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "ct_status" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "e_freight_status" text NULL;`)
    this.addSql(`ALTER TABLE "fms_projects" ADD COLUMN IF NOT EXISTS "charges_apply" text NULL;`)

    // Add foreign key constraints for party relationships
    this.addSql(`
      ALTER TABLE "fms_projects"
      ADD CONSTRAINT "fms_projects_notify_party_id_foreign"
      FOREIGN KEY ("notify_party_id") REFERENCES "contractors" ("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
    `)
    this.addSql(`
      ALTER TABLE "fms_projects"
      ADD CONSTRAINT "fms_projects_controlling_agent_id_foreign"
      FOREIGN KEY ("controlling_agent_id") REFERENCES "contractors" ("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
    `)
    this.addSql(`
      ALTER TABLE "fms_projects"
      ADD CONSTRAINT "fms_projects_controlling_customer_id_foreign"
      FOREIGN KEY ("controlling_customer_id") REFERENCES "contractors" ("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
    `)
    this.addSql(`
      ALTER TABLE "fms_projects"
      ADD CONSTRAINT "fms_projects_sending_agent_id_foreign"
      FOREIGN KEY ("sending_agent_id") REFERENCES "contractors" ("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
    `)
    this.addSql(`
      ALTER TABLE "fms_projects"
      ADD CONSTRAINT "fms_projects_receiving_agent_id_foreign"
      FOREIGN KEY ("receiving_agent_id") REFERENCES "contractors" ("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
    `)
    this.addSql(`
      ALTER TABLE "fms_projects"
      ADD CONSTRAINT "fms_projects_creditor_id_foreign"
      FOREIGN KEY ("creditor_id") REFERENCES "contractors" ("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
    `)

    // ============================================================================
    // FmsSeaContainer - Add CargoWise-aligned fields (~25 fields)
    // ============================================================================

    // Packing details
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "packs_count" int NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "pack_type" text NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "inners_count" int NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "inner_type" text NULL;`)

    // Measurements
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "loading_meters" numeric(12,3) NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "chargeable_weight" numeric(12,3) NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "wv_ratio" numeric(8,4) NULL;`)

    // Cargo identification
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "marks_and_numbers" text NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "hs_code" text NULL;`)

    // B/L status
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "on_board_status" text NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "on_board_date" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "bl_issue_date" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "originals_count" int NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "express_bills_count" int NULL;`)

    // Carrier/Voyage details
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "carrier_scac" text NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "imo_number" text NULL;`)

    // Cut-off dates
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "cto_receival_date" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "cto_cut_off_date" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "docs_due_date" timestamptz NULL;`)

    // Environmental
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "co2_emissions" numeric(12,3) NULL;`)

    // Pickup planning (pre-carriage)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "pickup_required_from" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "pickup_required_by" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "estimated_pickup" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "actual_pickup" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "pickup_location_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "pickup_notes" text NULL;`)

    // Delivery planning (on-carriage)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "delivery_required_by" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "estimated_delivery" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "actual_delivery" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "delivery_location_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "fms_sea_containers" ADD COLUMN IF NOT EXISTS "delivery_notes" text NULL;`)
  }

  override async down(): Promise<void> {
    // ============================================================================
    // FmsProject - Remove CargoWise-aligned fields
    // ============================================================================

    // Drop foreign key constraints first
    this.addSql(`ALTER TABLE "fms_projects" DROP CONSTRAINT IF EXISTS "fms_projects_notify_party_id_foreign";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP CONSTRAINT IF EXISTS "fms_projects_controlling_agent_id_foreign";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP CONSTRAINT IF EXISTS "fms_projects_controlling_customer_id_foreign";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP CONSTRAINT IF EXISTS "fms_projects_sending_agent_id_foreign";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP CONSTRAINT IF EXISTS "fms_projects_receiving_agent_id_foreign";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP CONSTRAINT IF EXISTS "fms_projects_creditor_id_foreign";`)

    // Drop columns
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "container_mode";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "service_level";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "bl_number";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "bl_type";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "release_type";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "notify_party_id";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "controlling_agent_id";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "controlling_customer_id";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "sending_agent_id";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "receiving_agent_id";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "agents_reference";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "creditor_id";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "goods_value";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "goods_value_currency";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "insurance_value";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "insurance_value_currency";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "is_domestic";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "additional_terms";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "payment_terms";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "ct_status";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "e_freight_status";`)
    this.addSql(`ALTER TABLE "fms_projects" DROP COLUMN IF EXISTS "charges_apply";`)

    // ============================================================================
    // FmsSeaContainer - Remove CargoWise-aligned fields
    // ============================================================================

    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "packs_count";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "pack_type";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "inners_count";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "inner_type";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "loading_meters";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "chargeable_weight";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "wv_ratio";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "marks_and_numbers";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "hs_code";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "on_board_status";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "on_board_date";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "bl_issue_date";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "originals_count";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "express_bills_count";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "carrier_scac";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "imo_number";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "cto_receival_date";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "cto_cut_off_date";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "docs_due_date";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "co2_emissions";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "pickup_required_from";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "pickup_required_by";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "estimated_pickup";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "actual_pickup";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "pickup_location_id";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "pickup_notes";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "delivery_required_by";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "estimated_delivery";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "actual_delivery";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "delivery_location_id";`)
    this.addSql(`ALTER TABLE "fms_sea_containers" DROP COLUMN IF EXISTS "delivery_notes";`)
  }
}
