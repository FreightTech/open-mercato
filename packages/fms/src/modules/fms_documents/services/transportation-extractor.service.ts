import type { TransportationMetadata, ContainerValidation } from '../data/schema-types'
import { CARRIER_PREFIXES } from '../data/schema-types'

/**
 * TransportationMetadataExtractor - Extracts shipping references from any document
 *
 * Extracts:
 * - Container numbers (ISO 6346 format)
 * - BL numbers (carrier prefix patterns)
 * - Vessel names
 * - Voyage numbers
 * - Ports (POL/POD)
 * - Carrier identification (SCAC codes)
 */
export class TransportationMetadataExtractor {
  // ISO 6346 container number pattern: 4 letters + 6 digits + check digit
  private static readonly CONTAINER_PATTERN = /\b([A-Z]{4})(\d{6})(\d)\b/gi
  // Alternative pattern for containers without strict check digit validation
  private static readonly CONTAINER_LOOSE_PATTERN = /\b[A-Z]{4}\d{7}\b/gi

  // BL number patterns for various carriers
  // Note: First pattern has no capture group to return the full match (carrier prefix + digits)
  private static readonly BL_PATTERNS = [
    /\b(?:COSU|MAEU|CMDU|HLCU|EGLV|MSCU|OOLU|YMLU|ZIMU|HDMU|SEAU|NYKU|APLU|KKLU|SUDU|ARKU|FSCU|GDYF|PCPL|POEU)\d{8,}\b/gi,
    /\bB\/L\s*(?:No\.?|Number)?:?\s*([A-Z0-9]{8,})/gi,
    /\bBL\s*(?:No\.?|Number)?:?\s*([A-Z0-9]{8,})/gi,
    /\bKonosament\s*(?:nr)?:?\s*([A-Z0-9]{8,})/gi,
  ]

  // Vessel name patterns
  private static readonly VESSEL_PATTERNS = [
    /\bM\/V\s+([A-Z][A-Z\s]+[A-Z])\b/gi,
    /\bVessel:?\s*([A-Z][A-Z\s]+[A-Z])\b/gi,
    /\bVSL:?\s*([A-Z][A-Z\s]+[A-Z])\b/gi,
    /\bMotor\s+Vessel:?\s*([A-Z][A-Z\s]+[A-Z])\b/gi,
  ]

  // Voyage number patterns
  private static readonly VOYAGE_PATTERNS = [
    /\bVOY(?:AGE)?\.?\s*(?:No\.?)?:?\s*([A-Z0-9-]+)\b/gi,
    /\bVVD:?\s*([A-Z0-9-]+)\b/gi,
    /\bVoyage:?\s*([A-Z0-9-]+)\b/gi,
  ]

  // Port patterns
  private static readonly PORT_PATTERNS = {
    pol: [
      /\bPOL:?\s*([A-Z][A-Z\s,]+(?:\([A-Z]{2,5}\))?)/gi,
      /\bPort\s+of\s+Loading:?\s*([A-Z][A-Z\s,]+)/gi,
      /\bLoading\s+Port:?\s*([A-Z][A-Z\s,]+)/gi,
    ],
    pod: [
      /\bPOD:?\s*([A-Z][A-Z\s,]+(?:\([A-Z]{2,5}\))?)/gi,
      /\bPort\s+of\s+Discharge:?\s*([A-Z][A-Z\s,]+)/gi,
      /\bDischarge\s+Port:?\s*([A-Z][A-Z\s,]+)/gi,
      /\bDestination:?\s*([A-Z][A-Z\s,]+)/gi,
    ],
  }

  // IMO number pattern
  private static readonly IMO_PATTERN = /\bIMO\s*:?\s*(\d{7})\b/gi

  // Booking number patterns
  private static readonly BOOKING_PATTERNS = [
    /\bBooking\s*(?:No\.?|Number|Ref)?:?\s*([A-Z0-9-]+)\b/gi,
    /\bBKG:?\s*([A-Z0-9-]+)\b/gi,
  ]

  // Date patterns for ETD/ETA
  private static readonly DATE_PATTERNS = {
    etd: [
      /\bETD:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi,
      /\bDeparture:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi,
    ],
    eta: [
      /\bETA:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi,
      /\bArrival:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi,
    ],
  }

  /**
   * Extract all transportation metadata from text
   */
  extract(text: string): TransportationMetadata {
    const normalizedText = text.toUpperCase()

    const containerNumbers = this.extractContainerNumbers(normalizedText)
    const blNumber = this.extractBlNumber(normalizedText)
    const vesselName = this.extractVesselName(normalizedText)
    const vesselImo = this.extractImoNumber(normalizedText)
    const voyageNumber = this.extractVoyageNumber(normalizedText)
    const portOfLoading = this.extractPort(normalizedText, 'pol')
    const portOfDischarge = this.extractPort(normalizedText, 'pod')
    const bookingNumber = this.extractBookingNumber(normalizedText)
    const etd = this.extractDate(normalizedText, 'etd')
    const eta = this.extractDate(normalizedText, 'eta')
    const carrierInfo = this.identifyCarrier(blNumber, normalizedText)

    return {
      blNumber: blNumber || null,
      containerNumbers: containerNumbers.length > 0 ? containerNumbers : undefined,
      vesselName: vesselName || null,
      vesselImo: vesselImo || null,
      voyageNumber: voyageNumber || null,
      portOfLoading: portOfLoading || null,
      portOfDischarge: portOfDischarge || null,
      etd: etd || null,
      eta: eta || null,
      bookingNumber: bookingNumber || null,
      carrierName: carrierInfo.name || null,
      carrierScac: carrierInfo.scac || null,
    }
  }

  /**
   * Extract and validate container numbers
   */
  extractContainerNumbers(text: string): string[] {
    const containers = new Set<string>()

    // Try strict ISO 6346 pattern first
    let match
    const strictPattern = new RegExp(TransportationMetadataExtractor.CONTAINER_PATTERN.source, 'gi')
    while ((match = strictPattern.exec(text)) !== null) {
      const containerNum = match[0].toUpperCase()
      if (this.validateContainerCheckDigit(containerNum)) {
        containers.add(containerNum)
      }
    }

    // Also try loose pattern for containers that might not have valid check digits
    const loosePattern = new RegExp(
      TransportationMetadataExtractor.CONTAINER_LOOSE_PATTERN.source,
      'gi'
    )
    while ((match = loosePattern.exec(text)) !== null) {
      const containerNum = match[0].toUpperCase()
      // Only add if not already found and looks like a container
      if (!containers.has(containerNum) && this.looksLikeContainer(containerNum)) {
        containers.add(containerNum)
      }
    }

    return Array.from(containers)
  }

  /**
   * Validate ISO 6346 check digit
   */
  validateContainerCheckDigit(containerNumber: string): boolean {
    if (!/^[A-Z]{4}\d{7}$/.test(containerNumber)) return false

    const letterValues: Record<string, number> = {
      A: 10,
      B: 12,
      C: 13,
      D: 14,
      E: 15,
      F: 16,
      G: 17,
      H: 18,
      I: 19,
      J: 20,
      K: 21,
      L: 23,
      M: 24,
      N: 25,
      O: 26,
      P: 27,
      Q: 28,
      R: 29,
      S: 30,
      T: 31,
      U: 32,
      V: 34,
      W: 35,
      X: 36,
      Y: 37,
      Z: 38,
    }

    let sum = 0
    for (let i = 0; i < 10; i++) {
      const char = containerNumber[i]
      const value = i < 4 ? letterValues[char] : parseInt(char, 10)
      sum += value * Math.pow(2, i)
    }

    const checkDigit = sum % 11 % 10
    return checkDigit === parseInt(containerNumber[10], 10)
  }

  /**
   * Check if a string looks like a container number
   */
  private looksLikeContainer(str: string): boolean {
    if (!/^[A-Z]{4}\d{7}$/.test(str)) return false
    // Check if first 3 letters could be an owner code
    // Last letter should be U (standard), J (detachable), or Z (trailer)
    const categoryCode = str[3]
    return ['U', 'J', 'Z'].includes(categoryCode)
  }

  /**
   * Extract BL number
   */
  extractBlNumber(text: string): string | null {
    for (const pattern of TransportationMetadataExtractor.BL_PATTERNS) {
      const regex = new RegExp(pattern.source, 'gi')
      const match = regex.exec(text)
      if (match) {
        // Return either the capture group or the full match
        return (match[1] || match[0]).toUpperCase().trim()
      }
    }
    return null
  }

  /**
   * Extract vessel name
   */
  extractVesselName(text: string): string | null {
    for (const pattern of TransportationMetadataExtractor.VESSEL_PATTERNS) {
      const regex = new RegExp(pattern.source, 'gi')
      const match = regex.exec(text)
      if (match && match[1]) {
        return this.cleanVesselName(match[1])
      }
    }
    return null
  }

  /**
   * Clean up vessel name
   */
  private cleanVesselName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  /**
   * Extract IMO number
   */
  extractImoNumber(text: string): string | null {
    const regex = new RegExp(TransportationMetadataExtractor.IMO_PATTERN.source, 'gi')
    const match = regex.exec(text)
    if (match && match[1]) {
      return match[1]
    }
    return null
  }

  /**
   * Extract voyage number
   */
  extractVoyageNumber(text: string): string | null {
    for (const pattern of TransportationMetadataExtractor.VOYAGE_PATTERNS) {
      const regex = new RegExp(pattern.source, 'gi')
      const match = regex.exec(text)
      if (match && match[1]) {
        return match[1].toUpperCase().trim()
      }
    }
    return null
  }

  /**
   * Extract port (POL or POD)
   */
  extractPort(text: string, type: 'pol' | 'pod'): string | null {
    const patterns = TransportationMetadataExtractor.PORT_PATTERNS[type]
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, 'gi')
      const match = regex.exec(text)
      if (match && match[1]) {
        return this.cleanPortName(match[1])
      }
    }
    return null
  }

  /**
   * Clean up port name
   */
  private cleanPortName(name: string): string {
    return name
      .trim()
      .replace(/[,\s]+$/, '')
      .replace(/\s+/g, ' ')
  }

  /**
   * Extract booking number
   */
  extractBookingNumber(text: string): string | null {
    for (const pattern of TransportationMetadataExtractor.BOOKING_PATTERNS) {
      const regex = new RegExp(pattern.source, 'gi')
      const match = regex.exec(text)
      if (match && match[1]) {
        return match[1].toUpperCase().trim()
      }
    }
    return null
  }

  /**
   * Extract date (ETD or ETA)
   */
  extractDate(text: string, type: 'etd' | 'eta'): string | null {
    const patterns = TransportationMetadataExtractor.DATE_PATTERNS[type]
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, 'gi')
      const match = regex.exec(text)
      if (match && match[1]) {
        return this.normalizeDate(match[1])
      }
    }
    return null
  }

  /**
   * Normalize date to ISO format
   */
  private normalizeDate(dateStr: string): string | null {
    try {
      // Try to parse common date formats
      const parts = dateStr.split(/[./-]/)
      if (parts.length !== 3) return null

      let day: number, month: number, year: number

      // Try DD.MM.YYYY or DD/MM/YYYY format first (common in EU)
      if (parseInt(parts[0], 10) <= 31) {
        day = parseInt(parts[0], 10)
        month = parseInt(parts[1], 10)
        year = parseInt(parts[2], 10)
      } else {
        // YYYY-MM-DD format
        year = parseInt(parts[0], 10)
        month = parseInt(parts[1], 10)
        day = parseInt(parts[2], 10)
      }

      // Handle 2-digit years
      if (year < 100) {
        year += year > 50 ? 1900 : 2000
      }

      if (month < 1 || month > 12 || day < 1 || day > 31) return null

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    } catch {
      return null
    }
  }

  /**
   * Identify carrier from BL number or text
   */
  identifyCarrier(
    blNumber: string | null,
    text: string
  ): { name: string | null; scac: string | null } {
    // Try to identify from BL prefix
    if (blNumber) {
      const prefix = blNumber.substring(0, 4)
      if (CARRIER_PREFIXES[prefix]) {
        return { name: CARRIER_PREFIXES[prefix], scac: prefix }
      }
    }

    // Try to find carrier name in text
    for (const [scac, name] of Object.entries(CARRIER_PREFIXES)) {
      if (text.includes(name.toUpperCase())) {
        return { name, scac }
      }
    }

    return { name: null, scac: null }
  }

  /**
   * Validate a single container number
   */
  validateContainer(containerNumber: string): ContainerValidation {
    const normalized = containerNumber.toUpperCase().replace(/\s/g, '')
    const valid = this.validateContainerCheckDigit(normalized)

    return {
      number: normalized,
      valid,
      owner: valid ? normalized.substring(0, 3) : undefined,
      checkDigit: valid ? normalized[10] : undefined,
    }
  }
}

/**
 * Factory function to create TransportationMetadataExtractor
 */
export function createTransportationExtractor(): TransportationMetadataExtractor {
  return new TransportationMetadataExtractor()
}

/**
 * Standalone function to validate container numbers.
 * Used by tracking-sync to filter out invalid/placeholder container numbers.
 *
 * A valid container number must:
 * 1. Not be null, undefined, or empty
 * 2. Match ISO 6346 format: 4 uppercase letters + 7 digits
 * 3. Fourth letter should be U (standard), J (detachable), or Z (trailer)
 *
 * @param containerNumber - The container number to validate
 * @param strict - If true, also validates the check digit (11th digit)
 * @returns true if valid container number format
 */
export function isValidContainerNumber(
  containerNumber: string | null | undefined,
  strict = false
): boolean {
  if (!containerNumber || typeof containerNumber !== 'string') return false

  const normalized = containerNumber.toUpperCase().replace(/\s/g, '')

  // Must match ISO 6346 format: 4 letters + 7 digits
  if (!/^[A-Z]{4}\d{7}$/.test(normalized)) return false

  // Check if fourth letter is valid category code (U, J, or Z)
  const categoryCode = normalized[3]
  if (!['U', 'J', 'Z'].includes(categoryCode)) return false

  // If strict mode, also validate the check digit
  if (strict) {
    const letterValues: Record<string, number> = {
      A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
      K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
      U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
    }

    let sum = 0
    for (let i = 0; i < 10; i++) {
      const char = normalized[i]
      const value = i < 4 ? letterValues[char] : parseInt(char, 10)
      sum += value * Math.pow(2, i)
    }

    const checkDigit = sum % 11 % 10
    if (checkDigit !== parseInt(normalized[10], 10)) return false
  }

  return true
}
