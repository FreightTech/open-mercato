/**
 * Booking Data Extractor
 *
 * Extracts and normalizes data from FmsDocument and its extractedData
 * (BookingConfirmationData) for project creation.
 */

import type { BookingConfirmationData, ExtractedBookingData } from '../data/types'
import { detectCarrierCode } from './carrier-scac-mapper'

/**
 * Document-like interface for extraction.
 * Uses a minimal subset of FmsDocument fields.
 */
export interface DocumentForExtraction {
  bookingNumber?: string | null
  blNumber?: string | null
  mblNumber?: string | null
}

/**
 * Parse date string to Date object, handling various formats.
 * Returns null for invalid or missing dates.
 */
export function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/**
 * Extracts and normalizes booking data from an FmsDocument and its extractedData.
 *
 * The LLM extraction may produce data in different structures:
 * - Top-level fields (e.g., booking_number)
 * - Nested under 'transportation' object (e.g., transportation.booking_number)
 *
 * Document fields (already populated by extraction route) take precedence over extractedData.
 *
 * @param document - The FmsDocument with pre-populated fields
 * @param extractedData - The raw LLM extraction output
 * @returns Normalized ExtractedBookingData ready for project creation
 */
export function extractBookingData(
  document: DocumentForExtraction,
  extractedData: BookingConfirmationData | null | undefined
): ExtractedBookingData {
  if (!extractedData) {
    return createEmptyExtractedData()
  }

  // Get transportation object (LLM may nest fields here)
  const transportation = extractedData.transportation

  // ============================================
  // Extract identifiers
  // Document fields first (already extracted and normalized by extraction route)
  // Then fall back to extractedData paths (both top-level and nested under transportation)
  // ============================================

  const bookingNumber =
    document.bookingNumber ||
    extractedData.booking_number ||
    transportation?.booking_number ||
    transportation?.job_no ||
    null

  const blNumber =
    document.blNumber ||
    extractedData.bl_number ||
    transportation?.bl_number ||
    transportation?.hbl_number ||
    transportation?.hbl_no ||
    null

  const mblNumber =
    document.mblNumber ||
    extractedData.mbl_number ||
    transportation?.mbl_number ||
    transportation?.mbl_no ||
    null

  // ============================================
  // Extract carrier info
  // ============================================

  const carrier = extractedData.carrier
  const carrierCode = detectCarrierCode(carrier)
  const carrierName = carrier?.name || null

  // ============================================
  // Extract vessel info (check both vessel object and transportation object)
  // ============================================

  const vesselName =
    extractedData.vessel?.name || transportation?.vessel_name || transportation?.vessel || null

  const voyageNumber = extractedData.vessel?.voyage_number || transportation?.voyage_number || null

  // ============================================
  // Extract routing (nested under routing object, or under transportation)
  // ============================================

  const portOfLoading =
    extractedData.routing?.port_of_loading ||
    transportation?.port_of_loading ||
    transportation?.pol ||
    null

  const portOfDischarge =
    extractedData.routing?.port_of_discharge ||
    transportation?.port_of_discharge ||
    transportation?.pod ||
    null

  // ============================================
  // Extract dates (nested under dates object, or under transportation)
  // ============================================

  const etd = parseDate(extractedData.dates?.etd) || parseDate(transportation?.etd)
  const eta = parseDate(extractedData.dates?.eta) || parseDate(transportation?.eta)
  const vgmCutoffDate = parseDate(extractedData.dates?.cutoff_vgm)
  const docCutoffDate = parseDate(extractedData.dates?.cutoff_si)
  const gateCloseDate = parseDate(extractedData.dates?.cutoff_cy)

  // ============================================
  // Extract cargo info
  // ============================================

  const commodityDescription =
    extractedData.cargo?.description || extractedData.cargo_description || null

  // ============================================
  // Extract container info
  // ============================================

  const rawContainers = extractedData.containers || extractedData.container_details || []
  const containerNumbers = rawContainers
    .map((c) => c.container_number)
    .filter((n): n is string => Boolean(n && n.trim()))

  // ============================================
  // Extract parties (for client matching)
  // ============================================

  const shipper = extractedData.shipper
  const consignee = extractedData.consignee

  return {
    bookingNumber,
    blNumber,
    mblNumber,
    carrierName,
    carrierCode,
    vesselName,
    voyageNumber,
    portOfLoading,
    portOfDischarge,
    etd,
    eta,
    vgmCutoffDate,
    docCutoffDate,
    gateCloseDate,
    commodityDescription,
    containerNumbers,
    rawContainers,
    shipper,
    consignee,
  }
}

/**
 * Creates an empty ExtractedBookingData object.
 * Used when extractedData is null/undefined.
 */
function createEmptyExtractedData(): ExtractedBookingData {
  return {
    bookingNumber: null,
    blNumber: null,
    mblNumber: null,
    carrierName: null,
    carrierCode: null,
    vesselName: null,
    voyageNumber: null,
    portOfLoading: null,
    portOfDischarge: null,
    etd: null,
    eta: null,
    vgmCutoffDate: null,
    docCutoffDate: null,
    gateCloseDate: null,
    commodityDescription: null,
    containerNumbers: [],
    rawContainers: [],
    shipper: undefined,
    consignee: undefined,
  }
}
