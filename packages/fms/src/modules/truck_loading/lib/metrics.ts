import type { PlacedCargo, TruckPreset, LoadingMetrics, CargoItem } from './types'

const CM2_TO_M2 = 1 / 10_000
const CM3_TO_M3 = 1 / 1_000_000
const CM_TO_M = 1 / 100

export function calculateMetrics(
  truck: TruckPreset,
  cargoItems: CargoItem[],
  placed: PlacedCargo[],
): LoadingMetrics {
  const totalItems = cargoItems.reduce((sum, item) => sum + item.quantity, 0)

  const floorAreaTotal = truck.width * truck.length * CM2_TO_M2
  const volumeTotal = truck.width * truck.length * truck.height * CM3_TO_M3
  const ldmTotal = truck.length * CM_TO_M

  let weightLoaded = 0
  let volumeUsed = 0
  let maxZ = 0

  const floorFootprints = new Set<string>()

  for (const item of placed) {
    weightLoaded += item.weight
    volumeUsed += item.width * item.length * item.height * CM3_TO_M3

    const endZ = item.posZ + item.length
    if (endZ > maxZ) {
      maxZ = endZ
    }

    if (item.posY === 0) {
      floorFootprints.add(`${item.posX},${item.posZ},${item.width},${item.length}`)
    }
  }

  let floorAreaUsed = 0
  for (const key of floorFootprints) {
    const [, , width, length] = key.split(',').map(Number)
    floorAreaUsed += width * length * CM2_TO_M2
  }

  const ldmUsed = maxZ * CM_TO_M
  const ldmRemaining = ldmTotal - ldmUsed

  return {
    floorAreaPercent: floorAreaTotal > 0 ? (floorAreaUsed / floorAreaTotal) * 100 : 0,
    floorAreaUsed: round(floorAreaUsed),
    floorAreaTotal: round(floorAreaTotal),
    ldmUsed: round(ldmUsed),
    ldmTotal: round(ldmTotal),
    ldmRemaining: round(ldmRemaining),
    ldmPercent: ldmTotal > 0 ? round((ldmUsed / ldmTotal) * 100) : 0,
    weightLoaded: round(weightLoaded),
    weightCapacity: truck.maxWeight,
    weightPercent: truck.maxWeight > 0 ? round((weightLoaded / truck.maxWeight) * 100) : 0,
    volumeUsed: round(volumeUsed),
    volumeTotal: round(volumeTotal),
    volumePercent: volumeTotal > 0 ? round((volumeUsed / volumeTotal) * 100) : 0,
    itemsPlaced: placed.length,
    itemsTotal: totalItems,
  }
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
