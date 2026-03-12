/**
 * Type definitions for Project Wizard components
 */

/**
 * Extracted data structure from booking confirmation documents.
 * Used when applying AI-extracted data to project fields.
 */
export interface BookingConfirmationExtraction {
  booking_number?: string
  bl_number?: string
  carrier?: {
    name?: string
    scac_code?: string
  }
  vessel?: {
    name?: string
    voyage_number?: string
    service_code?: string
    flag?: string
  }
  routing?: {
    place_of_receipt?: string
    port_of_loading?: string
    port_of_discharge?: string
    place_of_delivery?: string
  }
  dates?: {
    etd?: string
    eta?: string
    cutoff_vgm?: string
    cutoff_si?: string
    cutoff_cy?: string
  }
  // Support both field name variants from LLM extraction
  containers?: Array<{
    type?: string
    size_type?: string
    quantity?: number
  }>
  container_details?: Array<{
    type?: string
    size_type?: string
    container_type?: string
    quantity?: number
  }>
  shipper?: {
    name?: string
    address?: string
  }
  consignee?: {
    name?: string
    address?: string
  }
  cargo?: {
    nature?: string
    description?: string
    weight_kg?: number
    traffic_mode?: string
    soc_indicator?: string
  }
  cargo_description?: string
  booking_party?: string
  special_instructions?: string
}
