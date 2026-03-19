/**
 * Carrier SCAC Mapper
 *
 * Maps Standard Carrier Alpha Codes (SCAC) and carrier names to
 * internal carrier codes used by the tracking API.
 *
 * Extracted from useProjectWizard.ts for server-side use.
 */

/**
 * SCAC code to carrier code mapping
 * Maps Standard Carrier Alpha Codes to our internal carrier identifiers
 */
const SCAC_TO_CARRIER: Record<string, string> = {
  // Maersk
  MAEU: 'maersk',
  MSKU: 'maersk',
  SEAU: 'maersk',

  // MSC
  MSCU: 'msc',
  MEDU: 'msc',

  // CMA CGM
  CMAU: 'cma-cgm',
  ANNU: 'cma-cgm',
  APLU: 'cma-cgm',

  // Hapag-Lloyd
  HLCU: 'hapag-lloyd',

  // Evergreen
  EGLV: 'evergreen',

  // COSCO
  COSU: 'cosco',
  OOLU: 'cosco',

  // ZIM
  ZIMU: 'zim',

  // Yang Ming
  YMLU: 'yang-ming',

  // Hyundai
  HDMU: 'hyundai',

  // ONE (Ocean Network Express)
  ONEY: 'one',
  NYKU: 'one',
  MOLU: 'one',
}

/**
 * Carrier name pattern matching as fallback
 */
const CARRIER_PATTERNS: Array<[RegExp, string]> = [
  [/maersk/i, 'maersk'],
  [/msc|mediterranean\s*shipping/i, 'msc'],
  [/cma[\s-]?cgm/i, 'cma-cgm'],
  [/hapag[\s-]?lloyd/i, 'hapag-lloyd'],
  [/evergreen/i, 'evergreen'],
  [/cosco/i, 'cosco'],
  [/zim/i, 'zim'],
  [/yang[\s-]?ming/i, 'yang-ming'],
  [/hyundai/i, 'hyundai'],
  [/one|ocean\s*network/i, 'one'],
]

/**
 * Detects carrier code from SCAC code or carrier name
 *
 * @param carrier - Object with optional name and scac_code properties
 * @returns Carrier code (e.g., 'maersk', 'msc') or null if not detected
 *
 * @example
 * detectCarrierCode({ scac_code: 'MAEU' }) // 'maersk'
 * detectCarrierCode({ name: 'Maersk Line' }) // 'maersk'
 * detectCarrierCode({ name: 'Unknown Carrier' }) // null
 */
export function detectCarrierCode(
  carrier: { name?: string | null; scac_code?: string | null } | null | undefined
): string | null {
  if (!carrier) return null

  // 1. Try SCAC code first (most reliable)
  if (carrier.scac_code) {
    const scac = carrier.scac_code.toUpperCase()
    if (SCAC_TO_CARRIER[scac]) {
      return SCAC_TO_CARRIER[scac]
    }
    // Try first 4 chars as SCAC
    const scac4 = scac.substring(0, 4)
    if (SCAC_TO_CARRIER[scac4]) {
      return SCAC_TO_CARRIER[scac4]
    }
  }

  // 2. Fallback: Try carrier name patterns
  if (carrier.name) {
    for (const [pattern, code] of CARRIER_PATTERNS) {
      if (pattern.test(carrier.name)) {
        return code
      }
    }
  }

  return null
}

/**
 * Detects carrier code from carrier name only
 *
 * @param carrierName - Carrier name string
 * @returns Carrier code or null
 */
export function detectCarrierCodeFromName(carrierName: string | null | undefined): string | null {
  if (!carrierName) return null

  for (const [pattern, code] of CARRIER_PATTERNS) {
    if (pattern.test(carrierName)) {
      return code
    }
  }

  return null
}

/**
 * Gets the SCAC codes for a given carrier code
 *
 * @param carrierCode - Internal carrier code (e.g., 'maersk')
 * @returns Array of SCAC codes for this carrier
 */
export function getScacCodesForCarrier(carrierCode: string): string[] {
  return Object.entries(SCAC_TO_CARRIER)
    .filter(([, code]) => code === carrierCode)
    .map(([scac]) => scac)
}

/**
 * Checks if a carrier code is supported for tracking
 */
export function isCarrierSupported(carrierCode: string | null | undefined): boolean {
  if (!carrierCode) return false
  const supportedCarriers = new Set(Object.values(SCAC_TO_CARRIER))
  return supportedCarriers.has(carrierCode)
}
