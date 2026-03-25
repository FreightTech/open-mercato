export type {
  BrandConfig,
  BrandTheme,
  BrandThemeColors,
  BrandLayout,
  BrandSidebarLayout,
  BrandNavbarLayout,
} from './types'

export {
  registerBrands,
  getBrands,
  getDefaultBrand,
  getBrandById,
  getBrandByDomain,
  resolveBrandFromRequest,
  extractDomain,
} from './registry'

export {
  applyBrandFiltering,
  filterItemsByModule,
  shouldHideNavbarElement,
  buildBrandLogoConfig,
} from './filtering'
