import type { EntityManager } from '@mikro-orm/core'
import { FmsChargeCode, FmsProduct, FmsProductVariant } from '../data/entities'
import type { ProductType } from '../data/types'

/**
 * Factory function to create product instances based on type
 *
 * @param productType - The product type discriminator
 * @returns A new instance of FmsProduct with productType set
 *
 * @example
 * const product = createProductInstance('GFRT')
 * product.loop = 'MSC SWAN'
 * product.source = 'SHA'
 * product.destination = 'GDN'
 */
export function createProductInstance(productType: ProductType): FmsProduct {
  const product = new FmsProduct()
  product.productType = productType
  return product
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

/**
 * Helper to determine if a product type uses container sizes
 *
 * Freight and THC products use container-based variants (with containerSize).
 * All other products use simple variants (no containerSize).
 *
 * @param productType - The product type discriminator
 * @returns True if the product type uses container sizes
 *
 * @example
 * if (isContainerBasedProduct('GFRT')) {
 *   variant.containerSize = '40HC'
 * }
 */
export function isContainerBasedProduct(productType: ProductType): boolean {
  return productType === 'GFRT' || productType === 'GTHC'
}

/**
 * @deprecated Use isContainerBasedProduct() instead
 */
export function getVariantTypeForProduct(product: FmsProduct): 'container' | 'simple' {
  return isContainerBasedProduct(product.productType) ? 'container' : 'simple'
}

/**
 * @deprecated Use isContainerBasedProduct() instead
 */
export function getVariantTypeFromProductType(productType: ProductType): 'container' | 'simple' {
  return isContainerBasedProduct(productType) ? 'container' : 'simple'
}
