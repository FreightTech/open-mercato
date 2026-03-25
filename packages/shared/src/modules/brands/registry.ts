import type { BrandConfig } from './types'

let _brands: BrandConfig[] = []
let _defaultBrand: BrandConfig | null = null
let _domainToBrand: Map<string, BrandConfig> = new Map()
let _idToBrand: Map<string, BrandConfig> = new Map()

/**
 * Register brand configurations. Called at app bootstrap.
 * Builds internal lookup maps for domain and ID resolution.
 */
export function registerBrands(brands: BrandConfig[], defaultBrand: BrandConfig): void {
  _brands = brands
  _defaultBrand = defaultBrand

  _domainToBrand = new Map()
  for (const brand of brands) {
    for (const domain of brand.domains) {
      _domainToBrand.set(domain.toLowerCase(), brand)
    }
  }

  _idToBrand = new Map()
  for (const brand of brands) {
    _idToBrand.set(brand.id, brand)
  }
}

/**
 * Get all registered brands.
 */
export function getBrands(): BrandConfig[] {
  return _brands
}

/**
 * Get the default brand (fallback when no domain matches).
 */
export function getDefaultBrand(): BrandConfig | undefined {
  return _defaultBrand ?? undefined
}

/**
 * Get brand config by domain.
 * Supports exact match and subdomain matching (e.g., dev.fms.freighttech.org matches fms.freighttech.org).
 * Returns defaultBrand if no match found, or undefined if brands are not registered.
 */
export function getBrandByDomain(domain: string): BrandConfig | undefined {
  const normalizedDomain = domain.toLowerCase().split(':')[0]

  const exactMatch = _domainToBrand.get(normalizedDomain)
  if (exactMatch) return exactMatch

  // Try subdomain matching - progressively strip leftmost subdomain
  const parts = normalizedDomain.split('.')
  const parentDomains = parts.slice(1, -1).map((_, i) => parts.slice(i + 1).join('.'))
  const parentMatch = parentDomains
    .map((d) => _domainToBrand.get(d))
    .find((brand): brand is BrandConfig => brand !== undefined)

  return parentMatch ?? _defaultBrand ?? undefined
}

/**
 * Get brand config by id.
 * Returns defaultBrand if no match found, or undefined if brands are not registered.
 */
export function getBrandById(id: string): BrandConfig | undefined {
  return _idToBrand.get(id) ?? _defaultBrand ?? undefined
}

/**
 * Resolve brand configuration from a Request object.
 * Checks x-brand-id header first (set by proxy middleware),
 * falls back to host/x-forwarded-host header domain detection.
 */
export function resolveBrandFromRequest(req: Request): BrandConfig | undefined {
  const brandIdHeader = req.headers.get('x-brand-id')
  if (brandIdHeader) return getBrandById(brandIdHeader)

  const host = req.headers.get('host') ?? req.headers.get('x-forwarded-host') ?? ''
  if (host) return getBrandByDomain(host.split(':')[0])

  return undefined
}

/**
 * Extract domain from URL or host header.
 */
export function extractDomain(urlOrHost: string): string {
  try {
    if (urlOrHost.startsWith('http://') || urlOrHost.startsWith('https://')) {
      const url = new URL(urlOrHost)
      return url.hostname
    }
    return urlOrHost.split(':')[0]
  } catch {
    return urlOrHost.split(':')[0]
  }
}
