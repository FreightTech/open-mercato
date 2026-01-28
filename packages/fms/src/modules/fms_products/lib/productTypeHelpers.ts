/**
 * Client-safe helpers for product type derivation
 * These functions don't import MikroORM entities and can be used in client components.
 */

import type { ProductType } from '../data/types'

const SYSTEM_TYPES: ProductType[] = ['GFRT', 'GBAF', 'GBAF_PIECE', 'GBOL', 'GTHC', 'GCUS']

/**
 * Helper to derive product type from charge code
 *
 * @param chargeCode - The charge code string
 * @returns The derived product type
 */
export function deriveProductType(chargeCode: string | null | undefined): ProductType {
  if (chargeCode && SYSTEM_TYPES.includes(chargeCode as ProductType)) {
    return chargeCode as ProductType
  }
  return 'CUSTOM'
}

/**
 * Helper to determine if a product type uses container sizes
 *
 * Freight and THC products use container-based variants (with containerSize).
 * All other products use simple variants (no containerSize).
 *
 * @param productType - The product type discriminator (derived from charge code)
 * @returns True if the product type uses container sizes
 *
 * @example
 * const productType = deriveProductType(chargeCode)
 * if (isContainerBasedProduct(productType)) {
 *   variant.containerSize = '40HC'
 * }
 */
export function isContainerBasedProduct(productType: ProductType): boolean {
  return productType === 'GFRT' || productType === 'GTHC'
}

/**
 * Helper to check if a charge code represents a container-based product
 *
 * @param chargeCode - The charge code string
 * @returns True if the product type uses container sizes
 */
export function isContainerBasedChargeCode(chargeCode: string | null | undefined): boolean {
  return chargeCode === 'GFRT' || chargeCode === 'GTHC'
}
