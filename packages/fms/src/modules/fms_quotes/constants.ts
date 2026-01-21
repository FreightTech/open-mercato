// Margin thresholds for color coding
export const MARGIN_THRESHOLDS = {
  LOW: 5,      // Below this is red (concerning)
  MEDIUM: 10,  // Below this is yellow (moderate)
  HIGH: 15,    // Above this is green (healthy)
} as const

// Margin color classes
export const MARGIN_COLORS = {
  LOW: 'text-red-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-green-600',
} as const
