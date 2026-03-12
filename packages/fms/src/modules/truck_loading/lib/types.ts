export interface TruckCabConfig {
  /** Cab width in cm */
  width: number
  /** Cab length in cm (front to back) */
  length: number
  /** Cab height in cm (from ground to roof) */
  height: number
  /** Gap between cab and trailer in cm */
  gapFromTrailer: number
}

export interface TruckPreset {
  id: string
  label: string
  /** Internal width in cm */
  width: number
  /** Internal length in cm */
  length: number
  /** Internal height in cm */
  height: number
  /** Maximum payload weight in kg */
  maxWeight: number
  /** Optional truck cab configuration - if present, cab is rendered */
  cab?: TruckCabConfig
}

export interface CargoItem {
  id: string
  name: string
  /** Width in cm */
  width: number
  /** Length in cm (depth) */
  length: number
  /** Height in cm */
  height: number
  /** Weight in kg */
  weight: number
  /** Number of items of this type */
  quantity: number
  /** Whether items can be stacked on top of this one */
  stackable: boolean
  /** Color assigned for 3D visualization */
  color: string
}

export interface PlacedCargo {
  /** Reference to the source CargoItem id */
  cargoItemId: string
  /** Instance index within the quantity (0-based) */
  instanceIndex: number
  /** Placed width in cm (may differ from CargoItem if rotated) */
  width: number
  /** Placed length in cm */
  length: number
  /** Placed height in cm */
  height: number
  /** Weight in kg */
  weight: number
  /** X position in cm (left edge, width axis) */
  posX: number
  /** Y position in cm (bottom edge, height axis) */
  posY: number
  /** Z position in cm (front edge, length/depth axis) */
  posZ: number
  /** Display name */
  name: string
  /** Display color */
  color: string
  /** Whether this item is stackable */
  stackable: boolean
}

export interface PackingResult {
  placed: PlacedCargo[]
  unplaced: Array<{ cargoItemId: string; instanceIndex: number; name: string; reason: string }>
}

export interface LoadingMetrics {
  /** Floor area used as percentage of total */
  floorAreaPercent: number
  /** Floor area used in m2 */
  floorAreaUsed: number
  /** Total floor area in m2 */
  floorAreaTotal: number
  /** Loading meters used */
  ldmUsed: number
  /** Total loading meters available */
  ldmTotal: number
  /** LDM remaining */
  ldmRemaining: number
  /** LDM utilization percentage */
  ldmPercent: number
  /** Total weight loaded in kg */
  weightLoaded: number
  /** Max weight capacity in kg */
  weightCapacity: number
  /** Weight utilization percentage */
  weightPercent: number
  /** Volume used in m3 */
  volumeUsed: number
  /** Total volume in m3 */
  volumeTotal: number
  /** Volume utilization percentage */
  volumePercent: number
  /** Total items placed */
  itemsPlaced: number
  /** Total items requested */
  itemsTotal: number
}

export interface TruckLoadingSettings {
  autoStack: boolean
}

export type UnplacedReason = 'weight_exceeded' | 'no_space'

export interface UnplacedCargoDisplay {
  cargoItemId: string
  instanceIndex: number
  name: string
  width: number
  length: number
  height: number
  weight: number
  color: string
  reason: UnplacedReason
}
