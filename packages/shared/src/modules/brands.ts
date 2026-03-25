// Re-export all brand infrastructure from the brands directory
export type {
  BrandConfig,
  BrandTheme,
  BrandThemeColors,
  BrandLayout,
  BrandSidebarLayout,
  BrandNavbarLayout,
} from './brands/types'

export {
  registerBrands,
  getBrands,
  getDefaultBrand,
  getBrandById,
  getBrandByDomain,
  resolveBrandFromRequest,
  extractDomain,
} from './brands/registry'

export {
  applyBrandFiltering,
  filterItemsByModule,
  shouldHideNavbarElement,
  buildBrandLogoConfig,
} from './brands/filtering'
