import type { BrandConfig } from './types'

// Helper to parse domains from environment variable (comma-separated)
function getDomainsFromEnv(envVar: string, fallback: string[]): string[] {
  const envValue = process.env[envVar]
  if (envValue) {
    return envValue.split(',').map((d) => d.trim()).filter(Boolean)
  }
  return fallback
}

// Brand configurations
const openMercatoBrand: BrandConfig = {
  id: 'openmercato',
  name: 'Open Mercato',
  productName: 'Open Mercato',
  logo: {
    src: '/open-mercato.svg',
    width: 32,
    height: 32,
    alt: 'Open Mercato',
    name: 'Open Mercato',
  },
  domains: getDomainsFromEnv('OPENMERCATO_DOMAINS', ['localhost', '127.0.0.1', 'open-mercato.freighttech.org']),
  theme: {
    colors: {
      primaryHex: '#1a365d',
      accentHex: '#f7fafc',
    }},
    layout: {
      sidebar: {
        hiddenModules: [
          'frc-contractors', 'air-cargo', 'frc-console', 'frc-offers',
          'frc-rfqs', 'frc-rfqs-board', 'frc-projects', 'frc-trucks',
          // 4rcargo settings pages (only shown for 4rcargo brand)
          'frc-email-templates', 'frc-integrations',
        ],
        hiddenGroups: ['frc.nav.group'],
      },
    },
  
}

const freighttechBrand: BrandConfig = {
  id: 'freighttech',
  name: 'FreightTech',
  productName: 'FreightTech',
  logo: {
    src: '/fms/freighttech-logo.png',
    width: 32,
    height: 32,
    alt: 'FreightTech',
    name: 'FreightTech',
  },
  domains: getDomainsFromEnv('FREIGHTTECH_DOMAINS', ['freighttech.org', 'freighttech.localhost', 'fms.freighttech.org']),
  theme: {
    // Shared accent colors (both modes)
    colors: {
      accent: 'oklch(0.55 0.15 250)',
      accentForeground: 'oklch(0.98 0 0)',
    },
    // Light mode - blue-tinted theme
    light: {
      primary: 'oklch(0.45 0.15 250)',
      primaryForeground: 'oklch(0.98 0 0)',
      // Sidebar with subtle blue tint
      sidebar: 'oklch(0.97 0.01 250)',
      sidebarForeground: 'oklch(0.20 0.02 250)',
      sidebarPrimary: 'oklch(0.45 0.15 250)',
      sidebarPrimaryForeground: 'oklch(0.98 0 0)',
      sidebarAccent: 'oklch(0.92 0.03 250)',
      sidebarAccentForeground: 'oklch(0.25 0.05 250)',
      // Hex equivalents for PDF compatibility
      primaryHex: '#3B5998',
      accentHex: '#F7FAFC',
      // Light backgrounds
      background: 'oklch(0.99 0.005 250)',
      foreground: 'oklch(0.15 0.02 250)',
      card: 'oklch(0.99 0.005 250)',
      cardForeground: 'oklch(0.15 0.02 250)',
      muted: 'oklch(0.96 0.01 250)',
      mutedForeground: 'oklch(0.45 0 0)',
      border: 'oklch(0.90 0.02 250)',
    },
    // Dark mode - dark blue-tinted theme
    dark: {
      primary: 'oklch(0.65 0.15 250)',
      primaryForeground: 'oklch(0.98 0 0)',
      // Dark blue sidebar
      sidebar: 'oklch(0.18 0.04 250)',
      sidebarForeground: 'oklch(0.90 0 0)',
      sidebarPrimary: 'oklch(0.58 0.15 250)',
      sidebarPrimaryForeground: 'oklch(0.98 0 0)',
      sidebarAccent: 'oklch(0.25 0.05 250)',
      sidebarAccentForeground: 'oklch(0.92 0 0)',
      // Dark backgrounds
      background: 'oklch(0.14 0.02 250)',
      foreground: 'oklch(0.95 0 0)',
      card: 'oklch(0.18 0.03 250)',
      cardForeground: 'oklch(0.95 0 0)',
      muted: 'oklch(0.22 0.04 250)',
      mutedForeground: 'oklch(0.70 0 0)',
      border: 'oklch(0.30 0.03 250)',
    },
  },
  layout: {
    sidebar: {
      // Example: Hide specific modules for FreightTech brand
      hiddenModules: [
        'audit_logs', 'docs', 'example',
        // Hide 4rcargo modules
        'frc-contractors', 'air-cargo', 'frc-console', 'frc-offers',
        'frc-rfqs', 'frc-rfqs-board', 'frc-projects', 'frc-trucks',
        // 4rcargo settings pages (only shown for 4rcargo brand)
        'frc-email-templates', 'frc-integrations',
      ],
      hiddenGroups: ['catalog.nav.group', 'entities.nav.group', 'booking.nav.group', 'customers~sales.nav.group', 'frc.nav.group'],
    },
    navbar: {
      // Example: Hide elements from navbar
      // hideSearch: false,
    },
  },
}

const infBrand: BrandConfig = {
  id: 'inf',
  name: 'INF Shipping Solutions',
  productName: 'INF',
  logo: {
    src: '/fms/inf-logo.svg',
    width: 100,
    height: 40,
    alt: 'INF Shipping Solutions',
    name: '',
  },
  domains: getDomainsFromEnv('INF_DOMAINS', ['inf.localhost', 'inf.freighttech.org']),
  theme: {
    // Shared accent colors - orange identity (both modes)
    colors: {
      accent: 'oklch(0.62 0.18 35)', // #EB5C2E - orange
      accentForeground: 'oklch(0.98 0 0)',
    },
    // Light mode - orange primary with medium teal sidebar
    light: {
      primary: 'oklch(0.62 0.18 35)',
      primaryForeground: 'oklch(0.98 0 0)',
      // Teal sidebar (medium darkness for light mode)
      sidebar: 'oklch(0.35 0.04 200)', // #1F5058 - medium teal
      sidebarForeground: 'oklch(0.92 0 0)',
      sidebarPrimary: 'oklch(0.62 0.18 35)', // orange for active indicator bar
      sidebarPrimaryForeground: 'oklch(0.98 0 0)',
      sidebarAccent: 'oklch(0.42 0.06 180)', // lighter teal-green for UI panels
      sidebarAccentForeground: 'oklch(0.95 0 0)',
      // Light backgrounds with subtle teal tint
      background: 'oklch(0.99 0.005 200)',
      foreground: 'oklch(0.15 0.03 200)',
      card: 'oklch(0.99 0.005 200)',
      cardForeground: 'oklch(0.15 0.03 200)',
      muted: 'oklch(0.96 0.02 200)',
      mutedForeground: 'oklch(0.45 0 0)',
      border: 'oklch(0.88 0.02 200)',
    },
    // Dark mode - orange primary with darker teal sidebar
    dark: {
      primary: 'oklch(0.68 0.18 35)', // brighter orange for dark mode
      primaryForeground: 'oklch(0.98 0 0)',
      // Darker teal sidebar for dark mode
      sidebar: 'oklch(0.20 0.04 200)',
      sidebarForeground: 'oklch(0.90 0 0)',
      sidebarPrimary: 'oklch(0.68 0.18 35)', // brighter orange
      sidebarPrimaryForeground: 'oklch(0.98 0 0)',
      sidebarAccent: 'oklch(0.15 0.04 200)',
      sidebarAccentForeground: 'oklch(0.92 0 0)',
      // Hex equivalents for PDF compatibility
      primaryHex: '#EB5C2E',
      accentHex: '#FDF5F3',
      // Dark backgrounds with subtle teal tint
      background: 'oklch(0.14 0.03 200)',
      foreground: 'oklch(0.95 0 0)',
      card: 'oklch(0.18 0.03 200)',
      cardForeground: 'oklch(0.95 0 0)',
      muted: 'oklch(0.22 0.04 200)',
      mutedForeground: 'oklch(0.70 0 0)',
      border: 'oklch(0.30 0.03 200)',
    },
  },
  layout: {
    sidebar: {
      // Example: Hide specific modules for INF brand
      hiddenModules: [
        'audit_logs', 'docs', 'example',
        // Hide 4rcargo modules
        'frc-contractors', 'air-cargo', 'frc-console', 'frc-offers',
        'frc-rfqs', 'frc-rfqs-board', 'frc-projects', 'frc-trucks',
        // 4rcargo settings pages (only shown for 4rcargo brand)
        'frc-email-templates', 'frc-integrations',
      ],
      hiddenGroups: ['catalog.nav.group', 'entities.nav.group', 'booking.nav.group', 'customers~sales.nav.group', 'frc.nav.group'],
    },
    navbar: {
      // Example: Hide elements from navbar
      // hideSearch: false,
    },
  },
}

const frcBrand: BrandConfig = {
  id: '4rcargo',
  name: '4R Cargo',
  productName: '4R Cargo',
  logo: {
    src: '/fms/4rcargo-logo-white.png',
    srcLight: '/fms/4rcargo-logo-black.png',
    srcDark: '/fms/4rcargo-logo-white.png',
    width: 140,
    height: 32,
    alt: '4R Cargo',
    name: '',
  },
  domains: getDomainsFromEnv('FRC_DOMAINS', ['4rcargo.localhost', '4rcargo.freighttech.org', 'dev.4rcargo.freighttech.org']),
  theme: {
    // Base colors shared across both modes
    colors: {
      // Purple accent for brand identity (#9565f5)
      accent: 'oklch(0.58 0.20 290)',
      accentForeground: 'oklch(0.98 0 0)',
    },
    // Light mode: professional light theme with purple accents
    light: {
      // Deep purple primary for buttons/actions
      primary: 'oklch(0.45 0.18 290)',
      primaryForeground: 'oklch(0.98 0 0)',
      // Light purple-tinted sidebar
      sidebar: 'oklch(0.97 0.01 290)',
      sidebarForeground: 'oklch(0.20 0.02 290)',
      sidebarPrimary: 'oklch(0.50 0.18 290)',
      sidebarPrimaryForeground: 'oklch(0.98 0 0)',
      sidebarAccent: 'oklch(0.94 0.02 290)',
      sidebarAccentForeground: 'oklch(0.25 0.05 290)',
      // Light purple muted backgrounds (for task board, etc.)
      muted: 'oklch(0.96 0.01 290)',
      mutedForeground: 'oklch(0.45 0 0)',
      border: 'oklch(0.90 0.02 290)',
    },
    // Dark mode: original dark navy + purple theme
    dark: {
      // Purple primary for dark mode - visible against dark backgrounds
      primary: 'oklch(0.65 0.18 290)',
      primaryForeground: 'oklch(0.98 0 0)',
      // Sidebar - slightly lighter navy (#1a1a3a)
      sidebar: 'oklch(0.18 0.04 280)',
      sidebarForeground: 'oklch(0.90 0 0)',
      sidebarPrimary: 'oklch(0.58 0.20 290)',
      sidebarPrimaryForeground: 'oklch(0.98 0 0)',
      sidebarAccent: 'oklch(0.25 0.05 280)',
      sidebarAccentForeground: 'oklch(0.92 0 0)',
      // Dark navy muted
      muted: 'oklch(0.22 0.04 280)',
      mutedForeground: 'oklch(0.70 0 0)',
      border: 'oklch(0.30 0.03 280)',
    },
  },
  layout: {
    sidebar: {
      // Hide non-4R Cargo modules - only show frc_* modules
      hiddenModules: [
        'audit_logs', 'docs', 'example',
        // Hide standard FMS modules
        'fms-locations', 'fms-offers', 'fms-quotes', 'fms-projects',
        'contractors', 'fms-products', 'fms-financials', 'fms-documents',
        'shipments', 'fms-tracking',
      ],
      hiddenGroups: [
        'catalog.nav.group', 'entities.nav.group', 'booking.nav.group',
        'customers~sales.nav.group', 'customers.nav.group',
      ],
    },
    navbar: {
      hideOrgSwitcher: true,
    },
  },
}

const zieglerBrand: BrandConfig = {
  id: 'ziegler',
  name: 'Ziegler Group',
  productName: 'MyZiegler',
  logo: {
    src: '/fms/ziegler-logo-yellow.svg',
    srcLight: '/fms/ziegler-logo-yellow.svg',
    srcDark: '/fms/ziegler-logo-yellow.svg',
    width: 140,
    height: 32,
    alt: 'Ziegler',
    name: '',
  },
  domains: getDomainsFromEnv('ZIEGLER_DOMAINS', ['ziegler.localhost', 'ziegler.freighttech.org']),
  theme: {
    colors: {
      accent: 'oklch(0.90 0.14 95)',
      accentForeground: 'oklch(0.20 0.04 160)',
    },
    light: {
      primary: 'oklch(0.45 0.10 165)',
      primaryForeground: 'oklch(0.98 0 0)',
      sidebar: '#066A5D',
      sidebarForeground: 'oklch(0.92 0 0)',
      sidebarPrimary: 'oklch(0.90 0.14 95)',
      sidebarPrimaryForeground: 'oklch(0.20 0.04 160)',
      sidebarAccent: 'oklch(0.48 0.09 170)',
      sidebarAccentForeground: 'oklch(0.95 0 0)',
      background: 'oklch(0.99 0.005 165)',
      foreground: 'oklch(0.15 0.03 165)',
      card: 'oklch(0.99 0.005 165)',
      cardForeground: 'oklch(0.15 0.03 165)',
      muted: 'oklch(0.96 0.01 165)',
      mutedForeground: 'oklch(0.45 0 0)',
      border: 'oklch(0.88 0.02 165)',
      primaryHex: '#066A5D',
      accentHex: '#FFEE4D',
    },
    dark: {
      primary: 'oklch(0.55 0.10 165)',
      primaryForeground: 'oklch(0.98 0 0)',
      sidebar: 'oklch(0.20 0.04 165)',
      sidebarForeground: 'oklch(0.90 0 0)',
      sidebarPrimary: 'oklch(0.90 0.14 95)',
      sidebarPrimaryForeground: 'oklch(0.20 0.04 160)',
      sidebarAccent: 'oklch(0.25 0.05 165)',
      sidebarAccentForeground: 'oklch(0.92 0 0)',
      background: 'oklch(0.14 0.03 165)',
      foreground: 'oklch(0.95 0 0)',
      card: 'oklch(0.18 0.03 165)',
      cardForeground: 'oklch(0.95 0 0)',
      muted: 'oklch(0.22 0.04 165)',
      mutedForeground: 'oklch(0.70 0 0)',
      border: 'oklch(0.30 0.03 165)',
    },
  },
  layout: {
    sidebar: {
      hiddenModules: [
        'audit_logs', 'docs', 'example',
        'frc-contractors', 'air-cargo', 'frc-console', 'frc-offers',
        'frc-rfqs', 'frc-rfqs-board', 'frc-projects', 'frc-trucks',
        'frc-email-templates', 'frc-integrations',
      ],
      hiddenGroups: ['catalog.nav.group', 'entities.nav.group', 'booking.nav.group', 'customers~sales.nav.group', 'frc.nav.group'],
    },
    navbar: {
      hideOrgSwitcher: true,
    },
  },
}

// Register all brands here
export const brands: BrandConfig[] = [
  openMercatoBrand,
  freighttechBrand,
  infBrand,
  frcBrand,
  zieglerBrand,
]

// Default brand when no domain matches
export const defaultBrand = openMercatoBrand

// --- Static lookup maps for Edge middleware (proxy.ts) ---
// These are built at import time and work without bootstrap.
// Package code should use @open-mercato/shared/modules/brands instead.

const domainToBrand = new Map<string, BrandConfig>()
for (const brand of brands) {
  for (const domain of brand.domains) {
    domainToBrand.set(domain.toLowerCase(), brand)
  }
}

const idToBrand = new Map<string, BrandConfig>()
for (const brand of brands) {
  idToBrand.set(brand.id, brand)
}

export function getBrandByDomain(domain: string): BrandConfig {
  const normalizedDomain = domain.toLowerCase().split(':')[0]
  const exactMatch = domainToBrand.get(normalizedDomain)
  if (exactMatch) return exactMatch

  const parts = normalizedDomain.split('.')
  const parentDomains = parts.slice(1, -1).map((_, i) => parts.slice(i + 1).join('.'))
  const parentMatch = parentDomains
    .map((d) => domainToBrand.get(d))
    .find((brand): brand is BrandConfig => brand !== undefined)

  return parentMatch ?? defaultBrand
}

export function getBrandById(id: string): BrandConfig {
  return idToBrand.get(id) ?? defaultBrand
}

export function extractDomain(urlOrHost: string): string {
  try {
    if (urlOrHost.startsWith('http://') || urlOrHost.startsWith('https://')) {
      return new URL(urlOrHost).hostname
    }
    return urlOrHost.split(':')[0]
  } catch {
    return urlOrHost.split(':')[0]
  }
}
