import { Migration } from '@mikro-orm/migrations'

/**
 * Migration: Add product traceability fields to FmsOfferLine
 *
 * Adds product references to maintain traceability from quote lines:
 * - productId, variantId, priceId: Product catalog references
 * - sourceQuoteLineId: Link back to the original quote line
 */
export class Migration20260121200000 extends Migration {
  override async up(): Promise<void> {
    // Add product references to offer lines
    this.addSql(`
      alter table "fms_offer_lines"
      add column if not exists "product_id" uuid null,
      add column if not exists "variant_id" uuid null,
      add column if not exists "price_id" uuid null,
      add column if not exists "source_quote_line_id" uuid null;
    `)

    // Create indexes for lookups
    this.addSql(`
      create index if not exists "fms_offer_lines_product_idx"
      on "fms_offer_lines" ("product_id")
      where "product_id" is not null;
    `)

    this.addSql(`
      create index if not exists "fms_offer_lines_source_quote_idx"
      on "fms_offer_lines" ("source_quote_line_id")
      where "source_quote_line_id" is not null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fms_offer_lines_product_idx";`)
    this.addSql(`drop index if exists "fms_offer_lines_source_quote_idx";`)
    this.addSql(`
      alter table "fms_offer_lines"
      drop column if exists "product_id",
      drop column if exists "variant_id",
      drop column if exists "price_id",
      drop column if exists "source_quote_line_id";
    `)
  }
}
