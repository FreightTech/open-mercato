/**
 * Seed data for 4R Cargo FMS module
 * These airports are commonly used in air freight operations
 */

export interface AirportSeed {
  code: string
  longCode: string
  city: string
  country: string
  timezone: string
  latitude?: number
  longitude?: number
}

/**
 * Common airports for air freight operations
 * Focus on major cargo hubs and Estonian/Baltic connections
 */
export const AIRPORT_SEEDS: AirportSeed[] = [
  // Estonian airports
  { code: 'TLL', longCode: 'Tallinn Airport', city: 'Tallinn', country: 'Estonia', timezone: 'Europe/Tallinn', latitude: 59.4133, longitude: 24.8328 },
  { code: 'TAY', longCode: 'Tartu Airport', city: 'Tartu', country: 'Estonia', timezone: 'Europe/Tallinn', latitude: 58.3075, longitude: 26.6906 },
  
  // Baltic airports
  { code: 'RIX', longCode: 'Riga International Airport', city: 'Riga', country: 'Latvia', timezone: 'Europe/Riga', latitude: 56.9236, longitude: 23.9711 },
  { code: 'VNO', longCode: 'Vilnius Airport', city: 'Vilnius', country: 'Lithuania', timezone: 'Europe/Vilnius', latitude: 54.6341, longitude: 25.2858 },
  { code: 'KUN', longCode: 'Kaunas Airport', city: 'Kaunas', country: 'Lithuania', timezone: 'Europe/Vilnius', latitude: 54.9639, longitude: 24.0848 },
  
  // Nordic airports
  { code: 'HEL', longCode: 'Helsinki-Vantaa Airport', city: 'Helsinki', country: 'Finland', timezone: 'Europe/Helsinki', latitude: 60.3172, longitude: 24.9633 },
  { code: 'ARN', longCode: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm', latitude: 59.6519, longitude: 17.9186 },
  { code: 'CPH', longCode: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark', timezone: 'Europe/Copenhagen', latitude: 55.6181, longitude: 12.6561 },
  { code: 'OSL', longCode: 'Oslo Gardermoen Airport', city: 'Oslo', country: 'Norway', timezone: 'Europe/Oslo', latitude: 60.1939, longitude: 11.1004 },
  
  // Major European cargo hubs
  { code: 'FRA', longCode: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', timezone: 'Europe/Berlin', latitude: 50.0379, longitude: 8.5622 },
  { code: 'AMS', longCode: 'Amsterdam Schiphol Airport', city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam', latitude: 52.3086, longitude: 4.7639 },
  { code: 'LHR', longCode: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', timezone: 'Europe/London', latitude: 51.4700, longitude: -0.4543 },
  { code: 'CDG', longCode: 'Paris Charles de Gaulle Airport', city: 'Paris', country: 'France', timezone: 'Europe/Paris', latitude: 49.0097, longitude: 2.5479 },
  { code: 'BRU', longCode: 'Brussels Airport', city: 'Brussels', country: 'Belgium', timezone: 'Europe/Brussels', latitude: 50.9014, longitude: 4.4844 },
  { code: 'LGG', longCode: 'Liege Airport', city: 'Liege', country: 'Belgium', timezone: 'Europe/Brussels', latitude: 50.6372, longitude: 5.4428 },
  { code: 'LEJ', longCode: 'Leipzig/Halle Airport', city: 'Leipzig', country: 'Germany', timezone: 'Europe/Berlin', latitude: 51.4324, longitude: 12.2416 },
  { code: 'CGN', longCode: 'Cologne Bonn Airport', city: 'Cologne', country: 'Germany', timezone: 'Europe/Berlin', latitude: 50.8659, longitude: 7.1427 },
  { code: 'MUC', longCode: 'Munich Airport', city: 'Munich', country: 'Germany', timezone: 'Europe/Berlin', latitude: 48.3538, longitude: 11.7861 },
  { code: 'VIE', longCode: 'Vienna International Airport', city: 'Vienna', country: 'Austria', timezone: 'Europe/Vienna', latitude: 48.1103, longitude: 16.5697 },
  { code: 'ZRH', longCode: 'Zurich Airport', city: 'Zurich', country: 'Switzerland', timezone: 'Europe/Zurich', latitude: 47.4647, longitude: 8.5492 },
  { code: 'MXP', longCode: 'Milan Malpensa Airport', city: 'Milan', country: 'Italy', timezone: 'Europe/Rome', latitude: 45.6306, longitude: 8.7281 },
  { code: 'MAD', longCode: 'Madrid Barajas Airport', city: 'Madrid', country: 'Spain', timezone: 'Europe/Madrid', latitude: 40.4983, longitude: -3.5676 },
  
  // Eastern European
  { code: 'WAW', longCode: 'Warsaw Chopin Airport', city: 'Warsaw', country: 'Poland', timezone: 'Europe/Warsaw', latitude: 52.1657, longitude: 20.9671 },
  { code: 'PRG', longCode: 'Prague Vaclav Havel Airport', city: 'Prague', country: 'Czech Republic', timezone: 'Europe/Prague', latitude: 50.1008, longitude: 14.2600 },
  { code: 'BUD', longCode: 'Budapest Ferenc Liszt Airport', city: 'Budapest', country: 'Hungary', timezone: 'Europe/Budapest', latitude: 47.4298, longitude: 19.2611 },
  
  // Middle East cargo hubs
  { code: 'DXB', longCode: 'Dubai International Airport', city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', latitude: 25.2532, longitude: 55.3657 },
  { code: 'DOH', longCode: 'Hamad International Airport', city: 'Doha', country: 'Qatar', timezone: 'Asia/Qatar', latitude: 25.2731, longitude: 51.6081 },
  { code: 'AUH', longCode: 'Abu Dhabi International Airport', city: 'Abu Dhabi', country: 'UAE', timezone: 'Asia/Dubai', latitude: 24.4330, longitude: 54.6511 },
  
  // Asian cargo hubs
  { code: 'HKG', longCode: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong', latitude: 22.3080, longitude: 113.9185 },
  { code: 'SIN', longCode: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', latitude: 1.3644, longitude: 103.9915 },
  { code: 'ICN', longCode: 'Incheon International Airport', city: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul', latitude: 37.4692, longitude: 126.4505 },
  { code: 'NRT', longCode: 'Narita International Airport', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', latitude: 35.7647, longitude: 140.3864 },
  { code: 'PVG', longCode: 'Shanghai Pudong Airport', city: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai', latitude: 31.1434, longitude: 121.8052 },
  { code: 'PEK', longCode: 'Beijing Capital Airport', city: 'Beijing', country: 'China', timezone: 'Asia/Shanghai', latitude: 40.0801, longitude: 116.5846 },
  
  // North American cargo hubs
  { code: 'JFK', longCode: 'John F. Kennedy International Airport', city: 'New York', country: 'USA', timezone: 'America/New_York', latitude: 40.6413, longitude: -73.7781 },
  { code: 'ORD', longCode: 'Chicago O\'Hare International Airport', city: 'Chicago', country: 'USA', timezone: 'America/Chicago', latitude: 41.9742, longitude: -87.9073 },
  { code: 'LAX', longCode: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', latitude: 33.9416, longitude: -118.4085 },
  { code: 'MIA', longCode: 'Miami International Airport', city: 'Miami', country: 'USA', timezone: 'America/New_York', latitude: 25.7959, longitude: -80.2870 },
  { code: 'MEM', longCode: 'Memphis International Airport', city: 'Memphis', country: 'USA', timezone: 'America/Chicago', latitude: 35.0424, longitude: -89.9767 },
  { code: 'SDF', longCode: 'Louisville Muhammad Ali Airport', city: 'Louisville', country: 'USA', timezone: 'America/Kentucky/Louisville', latitude: 38.1744, longitude: -85.7360 },
  { code: 'ANC', longCode: 'Ted Stevens Anchorage Airport', city: 'Anchorage', country: 'USA', timezone: 'America/Anchorage', latitude: 61.1743, longitude: -149.9962 },
  { code: 'YYZ', longCode: 'Toronto Pearson Airport', city: 'Toronto', country: 'Canada', timezone: 'America/Toronto', latitude: 43.6777, longitude: -79.6248 },
]

/**
 * Truck type seeds for reference data
 */
export const TRUCK_TYPE_SEEDS = [
  { code: 'VAN', name: 'Van', description: 'Small cargo van for light deliveries' },
  { code: 'BOX', name: 'Box Truck', description: 'Medium box truck for general cargo' },
  { code: 'FLAT', name: 'Flatbed', description: 'Flatbed truck for oversized cargo' },
  { code: 'REEF', name: 'Refrigerated', description: 'Temperature-controlled truck' },
  { code: 'CURT', name: 'Curtainside', description: 'Curtainside truck for easy loading' },
  { code: 'TANK', name: 'Tanker', description: 'Liquid/bulk tanker truck' },
]
