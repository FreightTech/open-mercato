/**
 * Google Places API Service
 *
 * Provides server-side integration with Google Places API for:
 * - Address autocomplete suggestions
 * - Place details with address components and coordinates
 *
 * API Key is kept server-side to protect it from client exposure.
 */

export interface PlaceSuggestion {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

export interface AddressComponent {
  longName: string
  shortName: string
  types: string[]
}

export interface PlaceDetails {
  placeId: string
  formattedAddress: string
  addressComponents: AddressComponent[]
  location: {
    lat: number
    lng: number
  }
  // Parsed address fields
  streetNumber?: string
  route?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  countryCode?: string
}

export interface AutocompleteOptions {
  input: string
  types?: string[]
  language?: string
  region?: string
  sessionToken?: string
}

const PLACES_AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'

export class GooglePlacesService {
  private apiKey: string

  constructor() {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY environment variable is not set')
    }
    this.apiKey = apiKey
  }

  /**
   * Check if the service is available (API key is configured)
   */
  static isAvailable(): boolean {
    return !!process.env.GOOGLE_PLACES_API_KEY
  }

  /**
   * Get autocomplete suggestions for an address input
   */
  async autocomplete(options: AutocompleteOptions): Promise<PlaceSuggestion[]> {
    const params = new URLSearchParams({
      input: options.input,
      key: this.apiKey,
      types: options.types?.join('|') || 'address',
      language: options.language || 'en',
    })

    if (options.region) {
      params.set('region', options.region)
    }

    if (options.sessionToken) {
      params.set('sessiontoken', options.sessionToken)
    }

    const response = await fetch(`${PLACES_AUTOCOMPLETE_URL}?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API error: ${data.status} - ${data.error_message || 'Unknown error'}`)
    }

    return (data.predictions || []).map((prediction: any) => ({
      placeId: prediction.place_id,
      description: prediction.description,
      mainText: prediction.structured_formatting?.main_text || prediction.description,
      secondaryText: prediction.structured_formatting?.secondary_text || '',
    }))
  }

  /**
   * Get detailed place information including address components and coordinates
   */
  async getPlaceDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails> {
    const params = new URLSearchParams({
      place_id: placeId,
      key: this.apiKey,
      fields: 'place_id,formatted_address,address_components,geometry',
    })

    if (sessionToken) {
      params.set('sessiontoken', sessionToken)
    }

    const response = await fetch(`${PLACES_DETAILS_URL}?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (data.status !== 'OK') {
      throw new Error(`Google Places API error: ${data.status} - ${data.error_message || 'Unknown error'}`)
    }

    const result = data.result
    const components = this.parseAddressComponents(result.address_components || [])

    return {
      placeId: result.place_id,
      formattedAddress: result.formatted_address,
      addressComponents: (result.address_components || []).map((comp: any) => ({
        longName: comp.long_name,
        shortName: comp.short_name,
        types: comp.types,
      })),
      location: {
        lat: result.geometry?.location?.lat || 0,
        lng: result.geometry?.location?.lng || 0,
      },
      ...components,
    }
  }

  /**
   * Parse Google address components into a structured format
   */
  private parseAddressComponents(components: any[]): Partial<PlaceDetails> {
    const result: Partial<PlaceDetails> = {}

    let streetNumber = ''
    let route = ''
    let subpremise = ''

    for (const component of components) {
      const types = component.types || []

      if (types.includes('street_number')) {
        streetNumber = component.long_name
      } else if (types.includes('route')) {
        route = component.long_name
      } else if (types.includes('subpremise')) {
        subpremise = component.long_name
      } else if (types.includes('locality') || types.includes('postal_town')) {
        result.city = component.long_name
      } else if (types.includes('administrative_area_level_1')) {
        result.state = component.short_name
      } else if (types.includes('postal_code')) {
        result.postalCode = component.long_name
      } else if (types.includes('country')) {
        result.country = component.long_name
        result.countryCode = component.short_name
      }
    }

    // Build address line 1 from street number and route
    if (streetNumber || route) {
      result.addressLine1 = [streetNumber, route].filter(Boolean).join(' ')
    }

    // Address line 2 is typically subpremise (apt, suite, etc.)
    if (subpremise) {
      result.addressLine2 = subpremise
    }

    result.streetNumber = streetNumber || undefined
    result.route = route || undefined

    return result
  }
}

/**
 * Factory function to create a GooglePlacesService instance
 * Returns null if the service is not configured
 */
export function createGooglePlacesService(): GooglePlacesService | null {
  if (!GooglePlacesService.isAvailable()) {
    return null
  }
  return new GooglePlacesService()
}
