import type { ChargeUnit, ChargeCodeUsage } from '../data/types.js'

/**
 * System charge code definition
 */
export interface SystemChargeCode {
  code: string
  name: string
  description: string
  chargeUnit: ChargeUnit
  keywords: string[]
  usage: ChargeCodeUsage
  sortOrder: number
  isSystem: true
}

/**
 * Default system charge codes seeded on module initialization
 *
 * Code naming convention: G/O/D + F/L/A/R + XX
 * - G: Global (main freight charges)
 * - O: Origin (export side)
 * - D: Destination (import side)
 * - F: FCL (Full Container Load)
 * - L: LCL (Less than Container Load)
 * - A: Air
 * - R: Road
 *
 * 32 standardized system charge codes covering:
 * - Global charges (GFXX): Main freight, fuel, documentation, etc.
 * - Origin charges (OFXX): Export-side THC, customs, demurrage, etc.
 * - Destination charges (DFXX): Import-side THC, customs, delivery, etc.
 */
export const SYSTEM_CHARGE_CODES: SystemChargeCode[] = [
  // ========================================
  // GLOBAL (G) - Main Freight Charges
  // ========================================
  {
    code: 'GFFR',
    name: 'Ocean Freight',
    description: 'Ocean freight for containerized cargo',
    chargeUnit: 'container',
    keywords: ['Basic Freight', 'FAK', 'Freight', 'Freight All Kinds', 'Freight Rate', 'Ocean Freight', 'Sea Freight'],
    usage: 'most_common',
    sortOrder: 1,
    isSystem: true,
  },
  {
    code: 'GFFS',
    name: 'Fuel Surcharge',
    description: 'Bunker adjustment factor / fuel surcharge',
    chargeUnit: 'container',
    keywords: ['BAF', 'Bunker Adjustment Factor', 'Bunker Surcharge', 'FSC', 'Fuel Surcharge'],
    usage: 'most_common',
    sortOrder: 2,
    isSystem: true,
  },
  {
    code: 'GFPS',
    name: 'Peak Season Surcharge',
    description: 'Peak season / high demand surcharge',
    chargeUnit: 'container',
    keywords: ['High Season Surcharge', 'PSS', 'Peak Season Surcharge'],
    usage: 'common',
    sortOrder: 3,
    isSystem: true,
  },
  {
    code: 'GFVG',
    name: 'Verified Gross Mass',
    description: 'Container weight verification (SOLAS VGM)',
    chargeUnit: 'container',
    keywords: ['Container Weight Verification', 'VGM', 'Verified Gross Mass'],
    usage: 'common',
    sortOrder: 4,
    isSystem: true,
  },
  {
    code: 'GFSL',
    name: 'Container Seal',
    description: 'High security seal fee',
    chargeUnit: 'container',
    keywords: ['Container Seal', 'High Security Seal', 'Seal Fee'],
    usage: 'common',
    sortOrder: 5,
    isSystem: true,
  },
  {
    code: 'GFBL',
    name: 'B/L (Bill of Lading)',
    description: 'Bill of Lading documentation and issuance fee',
    chargeUnit: 'file',
    keywords: ['B/L (Bill of Lading)', 'BL Issuance', 'Bill of Lading', 'Original BL'],
    usage: 'most_common',
    sortOrder: 6,
    isSystem: true,
  },
  {
    code: 'GFBK',
    name: 'Booking Fee',
    description: 'Booking and reservation fee',
    chargeUnit: 'file',
    keywords: ['Booking Charge', 'Booking Fee', 'Reservation Fee'],
    usage: 'common',
    sortOrder: 7,
    isSystem: true,
  },
  {
    code: 'GFMA',
    name: 'Manifest Amendment Fee',
    description: 'Manifest change or amendment fee',
    chargeUnit: 'file',
    keywords: ['Amendment Charge', 'Manifest Amendment Fee', 'Manifest Change Fee'],
    usage: 'rare',
    sortOrder: 8,
    isSystem: true,
  },
  {
    code: 'GFMF',
    name: 'AMS (Automated Manifest System)',
    description: 'AMS filing fee for US imports',
    chargeUnit: 'file',
    keywords: ['AMS', 'AMS (Automated Manifest System)', 'AMS Filing', 'Automated Manifest System'],
    usage: 'common',
    sortOrder: 9,
    isSystem: true,
  },
  {
    code: 'GFTX',
    name: 'Telex Release',
    description: 'Electronic / express release fee',
    chargeUnit: 'file',
    keywords: ['Electronic Release', 'Express Release', 'TLX', 'Telex Release'],
    usage: 'common',
    sortOrder: 10,
    isSystem: true,
  },
  {
    code: 'GFIN',
    name: 'Cargo Insurance',
    description: 'Marine cargo insurance premium',
    chargeUnit: 'cargo_value_percent',
    keywords: ['Cargo Insurance', 'Freight Insurance', 'Marine Insurance'],
    usage: 'common',
    sortOrder: 11,
    isSystem: true,
  },
  {
    code: 'GFDG',
    name: 'Dangerous Goods Transport Fee',
    description: 'Dangerous goods / IMO / hazmat handling fee',
    chargeUnit: 'container',
    keywords: ['DG Fee', 'Dangerous Goods Fee', 'Dangerous Goods Transport Fee', 'Hazmat Fee', 'IMO Fee'],
    usage: 'common',
    sortOrder: 12,
    isSystem: true,
  },
  {
    code: 'GFFE',
    name: 'ENS Fee',
    description: 'Entry Summary Declaration fee for EU imports',
    chargeUnit: 'file',
    keywords: ['ENS Fee'],
    usage: 'common',
    sortOrder: 13,
    isSystem: true,
  },
  {
    code: 'GFCM',
    name: 'Container Management Fee',
    description: 'Container management and tracking fee',
    chargeUnit: 'container',
    keywords: ['Container Management Fee'],
    usage: 'rare',
    sortOrder: 14,
    isSystem: true,
  },
  {
    code: 'GFPU',
    name: 'Origin Pick Up',
    description: 'Pre-carriage / origin haulage / drayage',
    chargeUnit: 'container',
    keywords: ['Cartage', 'Drayage Origin', 'Inland Origin', 'Origin Haulage', 'Pick Up', 'Pickup Transport', 'Precarriage'],
    usage: 'most_common',
    sortOrder: 15,
    isSystem: true,
  },

  // ========================================
  // ORIGIN (O) - Export Side Charges
  // ========================================
  {
    code: 'OFTH',
    name: 'Origin THC',
    description: 'Terminal handling charge at origin port',
    chargeUnit: 'container',
    keywords: ['Export THC', 'Loading THC', 'Origin THC', 'Origin Terminal Handling Charge', 'Terminal Handling Origin'],
    usage: 'most_common',
    sortOrder: 16,
    isSystem: true,
  },
  {
    code: 'OFDC',
    name: 'Documentation Fee - Origin',
    description: 'Export documentation processing fee',
    chargeUnit: 'file',
    keywords: ['Documentation Fee - Origin', 'Export Documentation', 'Origin Docs', 'Origin Document Fee'],
    usage: 'common',
    sortOrder: 17,
    isSystem: true,
  },
  {
    code: 'OFCC',
    name: 'Export Customs Declaration',
    description: 'Export customs clearance and declaration',
    chargeUnit: 'file',
    keywords: ['Customs Clearance Export', 'Export Customs Clearance', 'Export Declaration', 'Origin Customs'],
    usage: 'most_common',
    sortOrder: 18,
    isSystem: true,
  },
  {
    code: 'OFDM',
    name: 'Origin Demurrage',
    description: 'Container demurrage at origin',
    chargeUnit: 'container',
    keywords: ['Container Demurrage Origin', 'Export Demurrage', 'Origin Demurrage'],
    usage: 'common',
    sortOrder: 19,
    isSystem: true,
  },
  {
    code: 'OFDT',
    name: 'Origin Detention',
    description: 'Container detention at origin',
    chargeUnit: 'container',
    keywords: ['Container Detention Origin', 'Export Detention', 'Origin Detention'],
    usage: 'common',
    sortOrder: 20,
    isSystem: true,
  },
  {
    code: 'OFBK',
    name: 'Origin Booking Fee',
    description: 'Booking fee at origin',
    chargeUnit: 'file',
    keywords: ['Origin Booking Fee'],
    usage: 'rare',
    sortOrder: 21,
    isSystem: true,
  },
  {
    code: 'OLCF',
    name: 'CFS Charges - Origin',
    description: 'Container Freight Station charges at origin (LCL)',
    chargeUnit: 'weight_measure',
    keywords: ['CFS Charges - Origin', 'CFS Charges Origin', 'Container Freight Station Export', 'LCL Charges Origin', 'Origin CFS', 'Origin Container Freight Station', 'LCL THC Origin'],
    usage: 'common',
    sortOrder: 22,
    isSystem: true,
  },

  // ========================================
  // DESTINATION (D) - Import Side Charges
  // ========================================
  {
    code: 'DFTH',
    name: 'Destination THC',
    description: 'Terminal handling charge at destination port',
    chargeUnit: 'container',
    keywords: ['Destination THC', 'Discharge THC', 'Import THC', 'Terminal Handling Destination'],
    usage: 'most_common',
    sortOrder: 23,
    isSystem: true,
  },
  {
    code: 'DFDC',
    name: 'Destination Documentation',
    description: 'Import documentation processing fee',
    chargeUnit: 'file',
    keywords: ['Destination Docs', 'Destination Document Fee', 'Destination Documentation', 'Import Documentation'],
    usage: 'common',
    sortOrder: 24,
    isSystem: true,
  },
  {
    code: 'DFCC',
    name: 'Destination Customs Clearance',
    description: 'Import customs clearance and declaration',
    chargeUnit: 'file',
    keywords: ['Customs Clearance Import', 'Destination Customs', 'Destination Customs Clearance', 'Import Customs Clearance', 'Import Declaration'],
    usage: 'most_common',
    sortOrder: 25,
    isSystem: true,
  },
  {
    code: 'DFDL',
    name: 'Destination Delivery',
    description: 'On-carriage / destination haulage / delivery',
    chargeUnit: 'container',
    keywords: ['Destination Delivery', 'Destination Transport', 'Drayage', 'Haulage Destination', 'Inland Destination', 'Linehaul', 'Oncarriage'],
    usage: 'most_common',
    sortOrder: 26,
    isSystem: true,
  },
  {
    code: 'DFDM',
    name: 'Destination Demurrage',
    description: 'Container demurrage at destination',
    chargeUnit: 'container',
    keywords: ['Container Demurrage - Destination', 'Container Demurrage Destination', 'Destination Demurrage', 'Detention Demurrage', 'Import Demurrage'],
    usage: 'common',
    sortOrder: 27,
    isSystem: true,
  },
  {
    code: 'DFDT',
    name: 'Destination Detention',
    description: 'Container detention at destination',
    chargeUnit: 'container',
    keywords: ['Container Detention Destination', 'Destination Detention', 'Detention - Destination', 'Import Detention'],
    usage: 'common',
    sortOrder: 28,
    isSystem: true,
  },
  {
    code: 'DFIS',
    name: 'ISF (Importer Security Filing)',
    description: 'Importer Security Filing (10+2) for US imports',
    chargeUnit: 'file',
    keywords: ['10+2', 'ISF (Importer Security Filing)', 'ISF Fee', 'ISF Filing', 'Importer Security Filing'],
    usage: 'common',
    sortOrder: 29,
    isSystem: true,
  },
  {
    code: 'DFIP',
    name: 'ISPS - Import',
    description: 'International Ship and Port Facility Security fee - import',
    chargeUnit: 'container',
    keywords: ['ISPS - Import', 'ISPS Import', 'Security Import'],
    usage: 'rare',
    sortOrder: 30,
    isSystem: true,
  },
  {
    code: 'DFXR',
    name: 'Screening Fee Destination',
    description: 'X-ray / screening fee at destination',
    chargeUnit: 'container',
    keywords: ['Screening Fee Destination', 'X-Ray Destination'],
    usage: 'rare',
    sortOrder: 31,
    isSystem: true,
  },
  {
    code: 'DLCF',
    name: 'CFS Charges - Destination',
    description: 'Container Freight Station charges at destination (LCL)',
    chargeUnit: 'weight_measure',
    keywords: ['CFS Charges - Destination', 'CFS Charges Destination', 'Container Freight Station Import', 'Destination CFS', 'LCL Charges Destination', 'LCL THC Destination'],
    usage: 'common',
    sortOrder: 32,
    isSystem: true,
  },
]
