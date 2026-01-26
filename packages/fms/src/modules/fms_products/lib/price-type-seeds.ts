/**
 * System price type definition
 */
export interface SystemPriceType {
  code: string
  name: string
  description: string
}

/**
 * Default price types (bundle types) describing what's included in the price
 *
 * Price types help categorize pricing offerings:
 * - All Inclusive: Complete door-to-door pricing
 * - Ocean Freight Only: Just the base freight rate
 * - FOB, CIF, DDP: Incoterms-based pricing
 */
export const DEFAULT_PRICE_TYPES: SystemPriceType[] = [
  // ========================================
  // ALL-IN / BUNDLED PRICING
  // ========================================
  {
    code: 'ALL_IN',
    name: 'All Inclusive',
    description: 'Complete door-to-door pricing including all charges',
  },
  {
    code: 'PORT_TO_PORT',
    name: 'Port to Port',
    description: 'Port-to-port rate including THC and basic charges',
  },

  // ========================================
  // COMPONENT-BASED PRICING
  // ========================================
  {
    code: 'OF_ONLY',
    name: 'Ocean Freight Only',
    description: 'Base ocean freight rate only (no surcharges)',
  },
  {
    code: 'OF_BAF',
    name: 'OF + BAF',
    description: 'Ocean freight with bunker adjustment factor',
  },
  {
    code: 'OF_BAF_THC',
    name: 'OF + BAF + THC',
    description: 'Ocean freight with fuel and terminal charges',
  },

  // ========================================
  // INCOTERMS-BASED PRICING
  // ========================================
  {
    code: 'EXW',
    name: 'Ex Works',
    description: 'Pickup from seller\'s premises (buyer arranges everything)',
  },
  {
    code: 'FCA',
    name: 'Free Carrier',
    description: 'Delivered to carrier at named place',
  },
  {
    code: 'FOB',
    name: 'Free On Board',
    description: 'Risk transfers when goods are loaded onto vessel at origin',
  },
  {
    code: 'CFR',
    name: 'Cost and Freight',
    description: 'Seller pays freight to destination port (risk at loading)',
  },
  {
    code: 'CIF',
    name: 'Cost, Insurance and Freight',
    description: 'CFR plus insurance (risk transfers at loading)',
  },
  {
    code: 'CPT',
    name: 'Carriage Paid To',
    description: 'Seller pays freight to named destination',
  },
  {
    code: 'CIP',
    name: 'Carriage and Insurance Paid To',
    description: 'CPT plus insurance coverage',
  },
  {
    code: 'DAP',
    name: 'Delivered at Place',
    description: 'Delivered to named place (unloading buyer\'s risk)',
  },
  {
    code: 'DPU',
    name: 'Delivered at Place Unloaded',
    description: 'Delivered and unloaded at named place',
  },
  {
    code: 'DDU',
    name: 'Delivered Duty Unpaid',
    description: 'Delivered but customs and duties not included',
  },
  {
    code: 'DDP',
    name: 'Delivered Duty Paid',
    description: 'Full delivery with customs clearance and duties paid',
  },

  // ========================================
  // SPOT / CONTRACT TYPES
  // ========================================
  {
    code: 'FAK',
    name: 'FAK (Freight All Kinds)',
    description: 'Standard spot rate for any cargo type',
  },
  {
    code: 'NAC',
    name: 'Named Account Contract',
    description: 'Contracted rate for specific account',
  },
  {
    code: 'BASKET',
    name: 'Basket Rate',
    description: 'Volume-based contract rate across multiple clients',
  },
]
