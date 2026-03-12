/**
 * System price type definition
 */
export interface SystemPriceType {
  code: string
  name: string
  description: string
}

/**
 * Default price types describing pricing model
 */
export const DEFAULT_PRICE_TYPES: SystemPriceType[] = [
  {
    code: 'ALL_IN',
    name: 'All In',
    description: 'Complete pricing including all charges',
  },
  {
    code: 'CUSTOM',
    name: 'Custom',
    description: 'Custom pricing arrangement',
  },
  {
    code: 'SPOT',
    name: 'Spot',
    description: 'Spot market rate',
  },
]
