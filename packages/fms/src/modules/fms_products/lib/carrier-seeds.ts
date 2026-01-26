import type { CarrierType } from '../data/types.js'

/**
 * System carrier definition
 */
export interface SystemCarrier {
  code: string
  name: string
  carrierType: CarrierType
}

/**
 * Default carrier codes for major shipping lines and airlines
 *
 * Carriers are the companies that operate the actual transport services.
 * - Sea: MSC, Maersk, Hapag-Lloyd, etc.
 * - Air: Lufthansa Cargo, Emirates SkyCargo, etc.
 * - Rail: Major rail freight operators
 * - Road: Major trucking companies
 */
export const DEFAULT_CARRIERS: SystemCarrier[] = [
  // ========================================
  // SEA CARRIERS - Major Ocean Shipping Lines
  // ========================================
  {
    code: 'MSC',
    name: 'Mediterranean Shipping Company',
    carrierType: 'sea',
  },
  {
    code: 'MAERSK',
    name: 'Maersk Line',
    carrierType: 'sea',
  },
  {
    code: 'COSCO',
    name: 'COSCO Shipping Lines',
    carrierType: 'sea',
  },
  {
    code: 'CMA_CGM',
    name: 'CMA CGM',
    carrierType: 'sea',
  },
  {
    code: 'HAPAG',
    name: 'Hapag-Lloyd',
    carrierType: 'sea',
  },
  {
    code: 'EVERGREEN',
    name: 'Evergreen Marine',
    carrierType: 'sea',
  },
  {
    code: 'ONE',
    name: 'Ocean Network Express',
    carrierType: 'sea',
  },
  {
    code: 'YANGMING',
    name: 'Yang Ming Marine',
    carrierType: 'sea',
  },
  {
    code: 'HMM',
    name: 'HMM (Hyundai Merchant Marine)',
    carrierType: 'sea',
  },
  {
    code: 'ZIM',
    name: 'ZIM Integrated Shipping',
    carrierType: 'sea',
  },
  {
    code: 'PIL',
    name: 'Pacific International Lines',
    carrierType: 'sea',
  },
  {
    code: 'OOCL',
    name: 'OOCL (Orient Overseas)',
    carrierType: 'sea',
  },
  {
    code: 'WANHAI',
    name: 'Wan Hai Lines',
    carrierType: 'sea',
  },

  // ========================================
  // AIR CARRIERS - Major Air Cargo Operators
  // ========================================
  {
    code: 'LH',
    name: 'Lufthansa Cargo',
    carrierType: 'air',
  },
  {
    code: 'BA',
    name: 'British Airways World Cargo',
    carrierType: 'air',
  },
  {
    code: 'EK',
    name: 'Emirates SkyCargo',
    carrierType: 'air',
  },
  {
    code: 'QR',
    name: 'Qatar Airways Cargo',
    carrierType: 'air',
  },
  {
    code: 'CX',
    name: 'Cathay Pacific Cargo',
    carrierType: 'air',
  },
  {
    code: 'SQ',
    name: 'Singapore Airlines Cargo',
    carrierType: 'air',
  },
  {
    code: 'KE',
    name: 'Korean Air Cargo',
    carrierType: 'air',
  },
  {
    code: 'CV',
    name: 'Cargolux',
    carrierType: 'air',
  },
  {
    code: 'FX',
    name: 'FedEx Express',
    carrierType: 'air',
  },
  {
    code: 'UPS',
    name: 'UPS Airlines',
    carrierType: 'air',
  },
  {
    code: 'DHL',
    name: 'DHL Aviation',
    carrierType: 'air',
  },
  {
    code: 'TK',
    name: 'Turkish Cargo',
    carrierType: 'air',
  },

  // ========================================
  // RAIL CARRIERS - Major Rail Freight Operators
  // ========================================
  {
    code: 'DB_CARGO',
    name: 'DB Cargo',
    carrierType: 'rail',
  },
  {
    code: 'CHINA_RAIL',
    name: 'China Railway Express',
    carrierType: 'rail',
  },
  {
    code: 'BNSF',
    name: 'BNSF Railway',
    carrierType: 'rail',
  },
  {
    code: 'UP',
    name: 'Union Pacific',
    carrierType: 'rail',
  },
]
