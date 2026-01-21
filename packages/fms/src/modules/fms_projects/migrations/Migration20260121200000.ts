import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Add product traceability fields to FmsProjectLine
 *
 * Adds product references and type fields for full traceability:
 * - productId, variantId, priceId: Product catalog references
 * - chargeCategory, chargeUnit, containerType: Type fields from offer
 */
export class Migration20260121200000 extends Migration {
  override async up(): Promise<void> {
    // Add product references to project lines
    this.addSql(`
      alter table "fms_project_lines"
      add column if not exists "product_id" uuid null,
      add column if not exists "variant_id" uuid null,
      add column if not exists "price_id" uuid null;
    `)

    // Add additional type fields from offer lines
    this.addSql(`
      alter table "fms_project_lines"
      add column if not exists "charge_category" text null,
      add column if not exists "charge_unit" text null,
      add column if not exists "container_type" text null;
    `)

    // Create index for product lookups
    this.addSql(`
      create index if not exists "fms_project_lines_product_idx"
      on "fms_project_lines" ("product_id")
      where "product_id" is not null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fms_project_lines_product_idx";`)
    this.addSql(`
      alter table "fms_project_lines"
      drop column if exists "product_id",
      drop column if exists "variant_id",
      drop column if exists "price_id",
      drop column if exists "charge_category",
      drop column if exists "charge_unit",
      drop column if exists "container_type";
    `)
  }
}
