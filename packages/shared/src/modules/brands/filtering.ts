import type { BrandConfig } from './types'

/**
 * Filters navigation items based on hidden modules.
 * Uses generic constraints so this works with any navigation item shape
 * that has an href and optional children.
 */
export function filterItemsByModule<T extends { href: string; children?: T[] }>(
  items: T[],
  hiddenModules: Set<string>
): T[] {
  if (hiddenModules.size === 0) return items

  return items
    .filter((item) => {
      const pathParts = item.href.split('/').filter(Boolean)
      const pathSegment = pathParts[1] // e.g., 'audit-logs' from '/backend/audit-logs/...'
      if (!pathSegment) return true

      // Check both raw path segment and normalized version (hyphens -> underscores)
      const normalizedSegment = pathSegment.replace(/-/g, '_')
      return !hiddenModules.has(pathSegment) && !hiddenModules.has(normalizedSegment)
    })
    .map((item) => ({
      ...item,
      children: item.children ? filterItemsByModule(item.children, hiddenModules) : undefined,
    }))
}

/**
 * Applies brand-level filtering to navigation groups.
 * Removes hidden groups and filters items by hidden modules.
 */
export function applyBrandFiltering<T extends { id: string; items: Array<{ href: string; children?: any[] }> }>(
  groups: T[],
  brandConfig: BrandConfig | undefined
): T[] {
  if (!brandConfig?.layout?.sidebar) {
    return groups
  }

  const hiddenGroups = new Set(brandConfig.layout.sidebar.hiddenGroups ?? [])
  const hiddenModules = new Set(brandConfig.layout.sidebar.hiddenModules ?? [])

  return groups
    .filter((group) => !hiddenGroups.has(group.id))
    .map((group) => ({
      ...group,
      items: filterItemsByModule(group.items, hiddenModules),
    }))
    .filter((group) => group.items.length > 0)
}

/**
 * Checks if a navbar element should be hidden based on brand configuration.
 */
export function shouldHideNavbarElement(
  brandConfig: BrandConfig | undefined,
  element: 'search' | 'orgSwitcher'
): boolean {
  if (!brandConfig?.layout?.navbar) {
    return false
  }

  switch (element) {
    case 'search':
      return brandConfig.layout.navbar.hideSearch === true
    case 'orgSwitcher':
      return brandConfig.layout.navbar.hideOrgSwitcher === true
    default:
      return false
  }
}

/**
 * Build brand logo configuration from brand config.
 * Returns undefined if no brand config is provided.
 */
export function buildBrandLogoConfig(brandConfig: BrandConfig | undefined) {
  if (!brandConfig) return undefined
  return {
    src: brandConfig.logo.src,
    srcLight: brandConfig.logo.srcLight,
    srcDark: brandConfig.logo.srcDark,
    alt: brandConfig.logo.alt,
    width: brandConfig.logo.width,
    height: brandConfig.logo.height,
    name: brandConfig.logo.name,
  }
}
