/**
 * Field classification for the flat product-variant view.
 * Used by the table page to route edits to the correct API endpoint.
 */

/**
 * Fields that belong to the FmsProduct entity.
 * Edits to these fields should update via /api/fms_products/products/{productId}
 */
export const PRODUCT_FIELDS = [
  'name',
  'chargeCodeId',
  'carrierId',
  'loop',
  'sourceId',
  'destinationId',
  'transitTime',
  'locationId',
  'description',
  'internalNotes',
  'isActive',
] as const

/**
 * Fields that belong to the FmsProductVariant entity.
 * Edits to these fields should update via /api/fms_products/products/{productId}/variants/{variantId}
 */
export const VARIANT_FIELDS = [
  'validityStart',
  'validityEnd',
  'price',
  'currencyCode',
  'providerId',
  'reference',
  'containerSize',
  'variantIsActive',
] as const

export type ProductField = (typeof PRODUCT_FIELDS)[number]
export type VariantField = (typeof VARIANT_FIELDS)[number]

/**
 * Check if a field belongs to the product entity
 */
export function isProductField(field: string): field is ProductField {
  return (PRODUCT_FIELDS as readonly string[]).includes(field)
}

/**
 * Check if a field belongs to the variant entity
 */
export function isVariantField(field: string): field is VariantField {
  return (VARIANT_FIELDS as readonly string[]).includes(field)
}

/**
 * Parse a composite row ID into product and variant IDs.
 * Row IDs are formatted as `${productId}:${variantId}` or `${productId}:no-variant`
 */
export function parseRowId(rowId: string): { productId: string; variantId: string | null } {
  const [productId, variantId] = rowId.split(':')
  return {
    productId,
    variantId: variantId === 'no-variant' ? null : variantId,
  }
}

/**
 * Create a composite row ID from product and variant IDs
 */
export function createRowId(productId: string, variantId: string | null): string {
  return `${productId}:${variantId ?? 'no-variant'}`
}
