import type { EntityManager } from '@mikro-orm/core'
import { FmsChargeCode, FmsProduct, FmsProductVariant } from '../data/entities'
import type { ProductType } from '../data/types'

// Re-export client-safe helpers for backward compatibility
export {
  deriveProductType,
  isContainerBasedProduct,
  isContainerBasedChargeCode,
} from './productTypeHelpers'

/**
 * Factory function to create product instances
 *
 * @returns A new instance of FmsProduct
 *
 * @example
 * const product = createProductInstance()
 * product.loop = 'MSC SWAN'
 * product.source = 'SHA'
 * product.destination = 'GDN'
 */
export function createProductInstance(): FmsProduct {
  return new FmsProduct()
}

/**
 * Factory function to create variant instances
 *
 * @returns A new instance of FmsProductVariant
 *
 * @example
 * const variant = createVariantInstance()
 * variant.containerSize = '40HC'
 * variant.price = '1500.00'
 */
export function createVariantInstance(): FmsProductVariant {
  const variant = new FmsProductVariant()
  return variant
}

/**
 * Helper to determine product type from charge code
 *
 * System charge codes map directly to product types.
 * Custom (non-system) charge codes use the CUSTOM product type.
 *
 * @param em - EntityManager instance
 * @param chargeCodeId - UUID of the charge code
 * @returns The product type discriminator
 * @throws Error if charge code is not found
 *
 * @example
 * const productType = await getProductTypeFromChargeCode(em, chargeCodeId)
 * const product = createProductInstance(productType)
 */
export async function getProductTypeFromChargeCode(
  em: EntityManager,
  chargeCodeId: string
): Promise<ProductType> {
  const chargeCode = await em.findOneOrFail(FmsChargeCode, { id: chargeCodeId })

  // System charge codes map directly to product types
  const systemTypes: ProductType[] = [
    'GFRT',
    'GBAF',
    'GBAF_PIECE',
    'GBOL',
    'GTHC',
    'GCUS',
  ]

  if (systemTypes.includes(chargeCode.code as ProductType)) {
    return chargeCode.code as ProductType
  }

  // Custom charge codes use CUSTOM product type
  return 'CUSTOM'
}
