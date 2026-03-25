/**
 * Brand-specific navigation filtering utilities.
 *
 * This module contains utilities for filtering sidebar navigation
 * based on brand configuration (hiddenModules, hiddenGroups).
 *
 * Extracted to a separate file to prevent accidental deletion during merge conflicts.
 */

import type { ReactNode } from 'react'
import type { BrandConfig } from '@/brands/types'

/**
 * Navigation item structure used in sidebar filtering
 */
export interface NavItem {
  href: string
  title: string
  defaultTitle: string
  enabled: boolean
  hidden?: boolean
  icon?: ReactNode
  pageContext?: 'main' | 'admin' | 'settings' | 'profile'
  children?: NavItem[]
}

/**
 * Navigation group structure used in sidebar filtering
 */
export interface NavGroup {
  id: string
  name: string
  defaultName: string
  items: NavItem[]
  weight: number
}

/**
 * Filters navigation items based on hidden modules.
 * Checks if item's href contains a hidden module path segment.
 *
 * @param items - Array of navigation items to filter
 * @param hiddenModules - Set of module identifiers to hide
 * @returns Filtered array of navigation items
 *
 * @example
 * ```ts
 * const hiddenModules = new Set(['audit_logs', 'docs'])
 * const filtered = filterItemsByModule(navItems, hiddenModules)
 * ```
 */
export function filterItemsByModule(items: NavItem[], hiddenModules: Set<string>): NavItem[] {
  if (hiddenModules.size === 0) return items

  return items
    .filter((item) => {
      // Check if item's href contains a hidden module
      // Hrefs are typically like /backend/modulename/...
      const pathParts = item.href.split('/').filter(Boolean)
      const pathSegment = pathParts[1] // e.g., 'audit-logs' from '/backend/audit-logs/...'
      if (!pathSegment) return true

      // Check both raw path segment and normalized version (hyphens -> underscores)
      // This allows users to specify either 'docs' or 'api_docs' in hiddenModules
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
 *
 * @param groups - Array of navigation groups to filter
 * @param brandConfig - Brand configuration (may be undefined if no brand detected)
 * @returns Filtered array of navigation groups
 *
 * @example
 * ```ts
 * const brandConfig = getBrandById(brandId)
 * const filteredGroups = applyBrandFiltering(navGroups, brandConfig)
 * ```
 */
export function applyBrandFiltering<T extends { id: string; items: NavItem[] }>(
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
    .filter((group) => group.items.length > 0) // Remove empty groups
}

/**
 * Checks if a navbar element should be hidden based on brand configuration.
 *
 * @param brandConfig - Brand configuration (may be undefined)
 * @param element - The navbar element to check ('search' | 'orgSwitcher')
 * @returns true if the element should be hidden
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
