import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsLocation } from '../data/entities'

/**
 * Major international airports data.
 * Used for seeding airport reference data in the fms_locations table.
 */
export const AIRPORTS = [
  // Europe
  { code: 'TLL', name: 'Tallinn Airport', city: 'Tallinn', country: 'Estonia', lat: 59.4133, lng: 24.8328 },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', lat: 50.0379, lng: 8.5622 },
  { code: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'United Kingdom', lat: 51.4700, lng: -0.4543 },
  { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France', lat: 49.0097, lng: 2.5479 },
  { code: 'AMS', name: 'Schiphol Airport', city: 'Amsterdam', country: 'Netherlands', lat: 52.3105, lng: 4.7683 },
  { code: 'MUC', name: 'Munich Airport', city: 'Munich', country: 'Germany', lat: 48.3537, lng: 11.7750 },
  { code: 'MAD', name: 'Adolfo Suarez Madrid-Barajas Airport', city: 'Madrid', country: 'Spain', lat: 40.4983, lng: -3.5676 },
  { code: 'FCO', name: 'Leonardo da Vinci International Airport', city: 'Rome', country: 'Italy', lat: 41.8045, lng: 12.2508 },
  { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland', lat: 47.4582, lng: 8.5555 },
  { code: 'VIE', name: 'Vienna International Airport', city: 'Vienna', country: 'Austria', lat: 48.1103, lng: 16.5697 },
  { code: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark', lat: 55.6180, lng: 12.6560 },
  { code: 'HEL', name: 'Helsinki-Vantaa Airport', city: 'Helsinki', country: 'Finland', lat: 60.3172, lng: 24.9633 },
  { code: 'OSL', name: 'Oslo Gardermoen Airport', city: 'Oslo', country: 'Norway', lat: 60.1976, lng: 11.1004 },
  { code: 'ARN', name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'Sweden', lat: 59.6519, lng: 17.9186 },
  { code: 'WAW', name: 'Warsaw Chopin Airport', city: 'Warsaw', country: 'Poland', lat: 52.1657, lng: 20.9671 },
  { code: 'PRG', name: 'Vaclav Havel Airport Prague', city: 'Prague', country: 'Czech Republic', lat: 50.1008, lng: 14.2600 },
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country: 'Belgium', lat: 50.9014, lng: 4.4844 },
  { code: 'LIS', name: 'Lisbon Airport', city: 'Lisbon', country: 'Portugal', lat: 38.7742, lng: -9.1342 },
  { code: 'ATH', name: 'Athens International Airport', city: 'Athens', country: 'Greece', lat: 37.9364, lng: 23.9445 },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', lat: 41.2753, lng: 28.7519 },
  { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland', lat: 53.4264, lng: -6.2499 },

  // North America
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States', lat: 40.6413, lng: -73.7781 },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'United States', lat: 33.9416, lng: -118.4085 },
  { code: 'ORD', name: "O'Hare International Airport", city: 'Chicago', country: 'United States', lat: 41.9742, lng: -87.9073 },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas', country: 'United States', lat: 32.8998, lng: -97.0403 },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', country: 'United States', lat: 33.6407, lng: -84.4277 },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', country: 'United States', lat: 25.7959, lng: -80.2870 },
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', country: 'United States', lat: 37.6213, lng: -122.3790 },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'United States', lat: 47.4502, lng: -122.3088 },
  { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'Canada', lat: 43.6777, lng: -79.6248 },
  { code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', country: 'Canada', lat: 49.1967, lng: -123.1815 },
  { code: 'MEX', name: 'Mexico City International Airport', city: 'Mexico City', country: 'Mexico', lat: 19.4361, lng: -99.0719 },

  // Asia
  { code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong', lat: 22.3080, lng: 113.9185 },
  { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', lat: 1.3644, lng: 103.9915 },
  { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan', lat: 35.7720, lng: 140.3929 },
  { code: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'Japan', lat: 35.5533, lng: 139.7811 },
  { code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea', lat: 37.4602, lng: 126.4407 },
  { code: 'PEK', name: 'Beijing Capital International Airport', city: 'Beijing', country: 'China', lat: 40.0799, lng: 116.6031 },
  { code: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'China', lat: 31.1443, lng: 121.8083 },
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand', lat: 13.6900, lng: 100.7501 },
  { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia', lat: 2.7456, lng: 101.7099 },
  { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'India', lat: 28.5562, lng: 77.1000 },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India', lat: 19.0896, lng: 72.8656 },
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates', lat: 25.2532, lng: 55.3657 },
  { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'Qatar', lat: 25.2731, lng: 51.6081 },

  // Oceania
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia', lat: -33.9461, lng: 151.1772 },
  { code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia', lat: -37.6690, lng: 144.8410 },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand', lat: -37.0082, lng: 174.7850 },

  // South America
  { code: 'GRU', name: 'Sao Paulo-Guarulhos International Airport', city: 'Sao Paulo', country: 'Brazil', lat: -23.4356, lng: -46.4731 },
  { code: 'EZE', name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', country: 'Argentina', lat: -34.8222, lng: -58.5358 },
  { code: 'SCL', name: 'Arturo Merino Benitez International Airport', city: 'Santiago', country: 'Chile', lat: -33.3930, lng: -70.7858 },
  { code: 'BOG', name: 'El Dorado International Airport', city: 'Bogota', country: 'Colombia', lat: 4.7016, lng: -74.1469 },
  { code: 'LIM', name: 'Jorge Chavez International Airport', city: 'Lima', country: 'Peru', lat: -12.0219, lng: -77.1143 },

  // Africa
  { code: 'JNB', name: 'O.R. Tambo International Airport', city: 'Johannesburg', country: 'South Africa', lat: -26.1392, lng: 28.2460 },
  { code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt', lat: 30.1219, lng: 31.4056 },
  { code: 'CMN', name: 'Mohammed V International Airport', city: 'Casablanca', country: 'Morocco', lat: 33.3675, lng: -7.5898 },
  { code: 'NBO', name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country: 'Kenya', lat: -1.3192, lng: 36.9278 },
  { code: 'ADD', name: 'Addis Ababa Bole International Airport', city: 'Addis Ababa', country: 'Ethiopia', lat: 8.9779, lng: 38.7993 },
] as const

export type AirportSeed = (typeof AIRPORTS)[number]

/**
 * Seeds airports for a specific tenant and organization.
 * 
 * @param em - MikroORM EntityManager
 * @param opts - Tenant and organization IDs
 * @returns Array of created airport IDs
 */
export async function seedAirports(
  em: EntityManager,
  opts: { tenantId: string; organizationId: string; createdBy?: string | null }
): Promise<string[]> {
  const { tenantId, organizationId, createdBy = null } = opts
  const createdIds: string[] = []

  for (const airport of AIRPORTS) {
    // Check if airport already exists (by code)
    const existing = await em.findOne(FmsLocation, {
      tenantId,
      organizationId,
      code: airport.code,
      type: 'airport',
      deletedAt: null,
    })

    if (existing) {
      continue
    }

    const location = em.create(FmsLocation, {
      tenantId,
      organizationId,
      code: airport.code,
      name: airport.name,
      type: 'airport',
      city: airport.city,
      country: airport.country,
      lat: airport.lat,
      lng: airport.lng,
      isActive: true,
      createdBy,
    })

    em.persist(location)
    createdIds.push(location.id)
  }

  await em.flush()
  return createdIds
}

/**
 * Seeds a single airport if it doesn't already exist.
 * 
 * @param em - MikroORM EntityManager
 * @param airport - Airport data
 * @param opts - Tenant and organization IDs
 * @returns The airport ID (existing or newly created)
 */
export async function seedAirport(
  em: EntityManager,
  airport: AirportSeed,
  opts: { tenantId: string; organizationId: string; createdBy?: string | null }
): Promise<string> {
  const { tenantId, organizationId, createdBy = null } = opts

  // Check if airport already exists
  const existing = await em.findOne(FmsLocation, {
    tenantId,
    organizationId,
    code: airport.code,
    type: 'airport',
    deletedAt: null,
  })

  if (existing) {
    return existing.id
  }

  const location = em.create(FmsLocation, {
    tenantId,
    organizationId,
    code: airport.code,
    name: airport.name,
    type: 'airport',
    city: airport.city,
    country: airport.country,
    lat: airport.lat,
    lng: airport.lng,
    isActive: true,
    createdBy,
  })

  await em.persist(location).flush()
  return location.id
}
