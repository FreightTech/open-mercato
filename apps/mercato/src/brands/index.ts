// Brand configuration data and static lookup functions (for Edge middleware / app code)
export {
  brands,
  defaultBrand,
  getBrandByDomain,
  getBrandById,
  extractDomain,
} from './registry'

// Types (from shared package)
export type {
  BrandConfig,
  BrandTheme,
  BrandThemeColors,
  BrandLayout,
  BrandSidebarLayout,
  BrandNavbarLayout,
} from '@open-mercato/shared/modules/brands'
