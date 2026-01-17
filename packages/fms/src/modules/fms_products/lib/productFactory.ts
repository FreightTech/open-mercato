import type { EntityManager } from '@mikro-orm/core'
import { FmsChargeCode, FmsProduct, FmsProductVariant } from '../data/entities'
import type { ProductType, VariantType } from '../data/types'

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
 * Factory function to create variant instances based on type
 *
 * @param variantType - The variant type discriminator
 * @returns A new instance of FmsProductVariant with variantType set
 *
 * @example
 * const variant = createVariantInstance('container')
 * variant.containerSize = '40HC'
 */
export function createVariantInstance(variantType: VariantType): FmsProductVariant {
  const variant = new FmsProductVariant()
  variant.variantType = variantType
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
 * Helper to determine variant type for a product
 *
 * Freight and THC products use container variants.
 * All other products use simple variants.
 *
 * @param product - Product instance
 * @returns The variant type discriminator
 *
 * @example
 * const variantType = getVariantTypeForProduct(product)
 * const variant = createVariantInstance(variantType)
 */
export function getVariantTypeForProduct(product: FmsProduct): VariantType {
  return product.productType === 'GFRT' || product.productType === 'GTHC'
    ? 'container'
    : 'simple'
}

/**
 * Helper to determine variant type from product type enum
 *
 * Useful when you have the product type but not the instance.
 *
 * @param productType - The product type discriminator
 * @returns The variant type discriminator
 *
 * @example
 * const variantType = getVariantTypeFromProductType('GFRT')
 * // Returns 'container'
 */
export function getVariantTypeFromProductType(productType: ProductType): VariantType {
  return productType === 'GFRT' || productType === 'GTHC' ? 'container' : 'simple'
}
