import type { CargoItem, PlacedCargo, PackingResult, TruckPreset, TruckLoadingSettings } from './types'

interface CandidateItem {
  cargoItemId: string
  instanceIndex: number
  name: string
  width: number
  length: number
  height: number
  weight: number
  stackable: boolean
  color: string
  volume: number
}

interface Space {
  posX: number
  posY: number
  posZ: number
  width: number
  length: number
  height: number
}

interface StackingPosition {
  posX: number
  posY: number
  posZ: number
  maxWidth: number
  maxLength: number
  maxHeight: number
}

/**
 * 3D bin-packing using a shelf-based Best Fit Decreasing Volume (BFD-V) heuristic
 * with enhanced stacking support.
 *
 * Items are sorted largest-volume-first (Decreasing Volume). For each item we
 * scan ALL available spaces and select the one that minimizes wasted space
 * (Best Fit). When an item is placed, the remaining space around it is split
 * into up to three new candidate spaces (right, front, top).
 *
 * Enhanced stacking:
 * - When `autoStack` is enabled, the algorithm also scans all placed stackable
 *   items to find valid stacking positions where a new item can be fully
 *   supported by one or more items below.
 * - This solves the issue where the floor is fully covered but vertical space
 *   remains unused because individual top spaces are too small.
 *
 * Rotation: items may be rotated 90 degrees on the floor plane (swap W/L)
 * to find a better fit.
 */
export function packCargo(
  truck: TruckPreset,
  cargoItems: CargoItem[],
  settings: TruckLoadingSettings,
): PackingResult {
  const placed: PlacedCargo[] = []
  const unplaced: PackingResult['unplaced'] = []

  const candidates = expandAndSort(cargoItems)

  let totalWeightPlaced = 0

  const spaces: Space[] = [
    {
      posX: 0,
      posY: 0,
      posZ: 0,
      width: truck.width,
      length: truck.length,
      height: truck.height,
    },
  ]

  for (const item of candidates) {
    if (totalWeightPlaced + item.weight > truck.maxWeight) {
      unplaced.push({
        cargoItemId: item.cargoItemId,
        instanceIndex: item.instanceIndex,
        name: item.name,
        reason: 'weight_exceeded',
      })
      continue
    }

    const placement = findBestFit(item, spaces, settings, placed, truck)

    if (placement) {
      placed.push({
        cargoItemId: item.cargoItemId,
        instanceIndex: item.instanceIndex,
        width: placement.usedWidth,
        length: placement.usedLength,
        height: item.height,
        weight: item.weight,
        posX: placement.posX,
        posY: placement.posY,
        posZ: placement.posZ,
        name: item.name,
        color: item.color,
        stackable: item.stackable,
      })
      totalWeightPlaced += item.weight

      // Only split space if placement came from a space (not a stacking position)
      if (placement.spaceIndex >= 0) {
        splitSpace(spaces, placement.spaceIndex, {
          width: placement.usedWidth,
          length: placement.usedLength,
          height: item.height,
          posX: placement.posX,
          posY: placement.posY,
          posZ: placement.posZ,
          stackable: item.stackable && settings.autoStack,
        })
      }
    } else {
      unplaced.push({
        cargoItemId: item.cargoItemId,
        instanceIndex: item.instanceIndex,
        name: item.name,
        reason: 'no_space',
      })
    }
  }

  return { placed, unplaced }
}

function expandAndSort(cargoItems: CargoItem[]): CandidateItem[] {
  const candidates: CandidateItem[] = []

  for (const item of cargoItems) {
    for (let instanceIndex = 0; instanceIndex < item.quantity; instanceIndex++) {
      candidates.push({
        cargoItemId: item.id,
        instanceIndex,
        name: item.name,
        width: item.width,
        length: item.length,
        height: item.height,
        weight: item.weight,
        stackable: item.stackable,
        color: item.color,
        volume: item.width * item.length * item.height,
      })
    }
  }

  candidates.sort((itemA, itemB) => itemB.volume - itemA.volume)
  return candidates
}

interface PlacementResult {
  spaceIndex: number
  posX: number
  posY: number
  posZ: number
  usedWidth: number
  usedLength: number
}

function findBestFit(
  item: CandidateItem,
  spaces: Space[],
  settings: TruckLoadingSettings,
  placed: PlacedCargo[],
  truck: TruckPreset,
): PlacementResult | null {
  let bestFit: PlacementResult | null = null
  let bestWaste = Infinity

  // First, try existing spaces
  for (let spaceIdx = 0; spaceIdx < spaces.length; spaceIdx++) {
    const space = spaces[spaceIdx]

    if (!settings.autoStack && space.posY > 0) {
      continue
    }

    if (space.posY > 0 && !canStackOn(space.posX, space.posZ, item.width, item.length, space.posY, placed)) {
      continue
    }

    const orientations: Array<[number, number]> = [
      [item.width, item.length],
      [item.length, item.width],
    ]

    for (const [orientedWidth, orientedLength] of orientations) {
      if (orientedWidth <= space.width && orientedLength <= space.length && item.height <= space.height) {
        // Check for collision with already-placed items
        if (wouldOverlap(space.posX, space.posY, space.posZ, orientedWidth, orientedLength, item.height, placed)) {
          continue
        }

        const waste = (space.width * space.length * space.height) - (orientedWidth * orientedLength * item.height)
        if (waste < bestWaste) {
          bestWaste = waste
          bestFit = {
            spaceIndex: spaceIdx,
            posX: space.posX,
            posY: space.posY,
            posZ: space.posZ,
            usedWidth: orientedWidth,
            usedLength: orientedLength,
          }
        }
      }
    }
  }

  // If autoStack is enabled and we haven't found a good floor-level fit,
  // look for stacking positions on top of placed items
  if (settings.autoStack) {
    const stackingPositions = findStackingPositions(placed, truck)

    for (const stackPos of stackingPositions) {
      const orientations: Array<[number, number]> = [
        [item.width, item.length],
        [item.length, item.width],
      ]

      for (const [orientedWidth, orientedLength] of orientations) {
        if (
          orientedWidth <= stackPos.maxWidth &&
          orientedLength <= stackPos.maxLength &&
          item.height <= stackPos.maxHeight
        ) {
          // Check for collision with already-placed items
          if (wouldOverlap(stackPos.posX, stackPos.posY, stackPos.posZ, orientedWidth, orientedLength, item.height, placed)) {
            continue
          }

          // Check if this position is fully supported
          if (isFullySupported(stackPos.posX, stackPos.posZ, orientedWidth, orientedLength, stackPos.posY, placed)) {
            // Calculate waste based on available space at this position
            const availableVolume = stackPos.maxWidth * stackPos.maxLength * stackPos.maxHeight
            const itemVolume = orientedWidth * orientedLength * item.height
            const waste = availableVolume - itemVolume

            if (waste < bestWaste) {
              bestWaste = waste
              bestFit = {
                spaceIndex: -1, // Indicates this is a stacking position, not a space
                posX: stackPos.posX,
                posY: stackPos.posY,
                posZ: stackPos.posZ,
                usedWidth: orientedWidth,
                usedLength: orientedLength,
              }
            }
          }
        }
      }
    }
  }

  return bestFit
}

/**
 * Find all potential stacking positions on top of placed stackable items.
 * Groups items by their top Y coordinate and generates positions at each level.
 */
function findStackingPositions(placed: PlacedCargo[], truck: TruckPreset): StackingPosition[] {
  const positions: StackingPosition[] = []

  // Group stackable items by their top Y level
  const levelMap = new Map<number, PlacedCargo[]>()

  for (const item of placed) {
    if (!item.stackable) continue
    const topY = item.posY + item.height
    if (!levelMap.has(topY)) {
      levelMap.set(topY, [])
    }
    levelMap.get(topY)!.push(item)
  }

  // For each level, generate potential stacking positions
  for (const [topY, itemsAtLevel] of levelMap) {
    const remainingHeight = truck.height - topY
    if (remainingHeight <= 0) continue

    // Generate positions at corners of each stackable item at this level
    for (const item of itemsAtLevel) {
      // Position directly on top of this item
      positions.push({
        posX: item.posX,
        posY: topY,
        posZ: item.posZ,
        maxWidth: item.width,
        maxLength: item.length,
        maxHeight: remainingHeight,
      })
    }

    // Also try to find merged regions where multiple items form a continuous surface
    const mergedRegions = findMergedStackingRegions(itemsAtLevel, truck, topY)
    for (const region of mergedRegions) {
      positions.push({
        posX: region.posX,
        posY: topY,
        posZ: region.posZ,
        maxWidth: region.width,
        maxLength: region.length,
        maxHeight: remainingHeight,
      })
    }
  }

  // Sort positions to prefer lower levels and positions closer to origin
  positions.sort((a, b) => {
    if (a.posY !== b.posY) return a.posY - b.posY
    if (a.posZ !== b.posZ) return a.posZ - b.posZ
    return a.posX - b.posX
  })

  return positions
}

/**
 * Find merged rectangular regions formed by adjacent stackable items.
 * This allows placing items that span multiple base items.
 */
function findMergedStackingRegions(
  items: PlacedCargo[],
  truck: TruckPreset,
  _topY: number,
): Array<{ posX: number; posZ: number; width: number; length: number }> {
  const regions: Array<{ posX: number; posZ: number; width: number; length: number }> = []

  if (items.length < 2) return regions

  // Try to find items that are adjacent and form larger rectangles
  // Start with items aligned on the X axis (same posX, adjacent posZ)
  const byPosX = new Map<number, PlacedCargo[]>()
  for (const item of items) {
    if (!byPosX.has(item.posX)) {
      byPosX.set(item.posX, [])
    }
    byPosX.get(item.posX)!.push(item)
  }

  // For items at the same X, check if they form a continuous strip along Z
  for (const [posX, itemsAtX] of byPosX) {
    if (itemsAtX.length < 2) continue

    // Sort by posZ
    itemsAtX.sort((a, b) => a.posZ - b.posZ)

    // Find continuous strips
    let stripStart = itemsAtX[0]
    let stripEnd = itemsAtX[0]
    let minWidth = itemsAtX[0].width

    for (let i = 1; i < itemsAtX.length; i++) {
      const current = itemsAtX[i]
      const prevEnd = stripEnd.posZ + stripEnd.length

      // Check if current item is adjacent to the strip (with small tolerance)
      if (Math.abs(current.posZ - prevEnd) < 1) {
        stripEnd = current
        minWidth = Math.min(minWidth, current.width)
      } else {
        // Save the strip if it spans multiple items
        if (stripEnd !== stripStart) {
          regions.push({
            posX: posX,
            posZ: stripStart.posZ,
            width: minWidth,
            length: stripEnd.posZ + stripEnd.length - stripStart.posZ,
          })
        }
        // Start new strip
        stripStart = current
        stripEnd = current
        minWidth = current.width
      }
    }

    // Don't forget the last strip
    if (stripEnd !== stripStart) {
      regions.push({
        posX: posX,
        posZ: stripStart.posZ,
        width: minWidth,
        length: stripEnd.posZ + stripEnd.length - stripStart.posZ,
      })
    }
  }

  // Also try items aligned on the Z axis (same posZ, adjacent posX)
  const byPosZ = new Map<number, PlacedCargo[]>()
  for (const item of items) {
    if (!byPosZ.has(item.posZ)) {
      byPosZ.set(item.posZ, [])
    }
    byPosZ.get(item.posZ)!.push(item)
  }

  for (const [posZ, itemsAtZ] of byPosZ) {
    if (itemsAtZ.length < 2) continue

    itemsAtZ.sort((a, b) => a.posX - b.posX)

    let stripStart = itemsAtZ[0]
    let stripEnd = itemsAtZ[0]
    let minLength = itemsAtZ[0].length

    for (let i = 1; i < itemsAtZ.length; i++) {
      const current = itemsAtZ[i]
      const prevEnd = stripEnd.posX + stripEnd.width

      if (Math.abs(current.posX - prevEnd) < 1) {
        stripEnd = current
        minLength = Math.min(minLength, current.length)
      } else {
        if (stripEnd !== stripStart) {
          regions.push({
            posX: stripStart.posX,
            posZ: posZ,
            width: stripEnd.posX + stripEnd.width - stripStart.posX,
            length: minLength,
          })
        }
        stripStart = current
        stripEnd = current
        minLength = current.length
      }
    }

    if (stripEnd !== stripStart) {
      regions.push({
        posX: stripStart.posX,
        posZ: posZ,
        width: stripEnd.posX + stripEnd.width - stripStart.posX,
        length: minLength,
      })
    }
  }

  // Try to find the full bounding box if all items are at the same level
  // and form a mostly continuous surface
  const minX = Math.min(...items.map((i) => i.posX))
  const maxX = Math.max(...items.map((i) => i.posX + i.width))
  const minZ = Math.min(...items.map((i) => i.posZ))
  const maxZ = Math.max(...items.map((i) => i.posZ + i.length))

  // Calculate coverage - what percentage of the bounding box is covered by items
  const boundingArea = (maxX - minX) * (maxZ - minZ)
  const itemsArea = items.reduce((sum, item) => sum + item.width * item.length, 0)
  const coverage = itemsArea / boundingArea

  // If coverage is high (>80%), add the full bounding box as a potential region
  if (coverage > 0.8) {
    regions.push({
      posX: minX,
      posZ: minZ,
      width: maxX - minX,
      length: maxZ - minZ,
    })
  }

  return regions
}

/**
 * Check if placing an item at the given position would overlap with any already-placed item.
 * This is a 3D collision check that ensures no two items occupy the same space.
 */
function wouldOverlap(
  posX: number,
  posY: number,
  posZ: number,
  width: number,
  length: number,
  height: number,
  placed: PlacedCargo[],
): boolean {
  for (const item of placed) {
    // Check if items overlap in all three dimensions
    const overlapX = posX < item.posX + item.width && posX + width > item.posX
    const overlapY = posY < item.posY + item.height && posY + height > item.posY
    const overlapZ = posZ < item.posZ + item.length && posZ + length > item.posZ

    if (overlapX && overlapY && overlapZ) {
      return true
    }
  }
  return false
}

/**
 * Check if a position at the given Y level can support an item.
 * Returns true if the item's footprint overlaps with at least one stackable item below.
 */
function canStackOn(
  posX: number,
  posZ: number,
  itemWidth: number,
  itemLength: number,
  atY: number,
  placed: PlacedCargo[],
): boolean {
  for (const placedItem of placed) {
    if (!placedItem.stackable) continue

    // Check if this placed item's top is at the same level we want to stack on
    const placedTop = placedItem.posY + placedItem.height
    if (Math.abs(placedTop - atY) > 0.1) continue

    const overlapX = posX < placedItem.posX + placedItem.width && posX + itemWidth > placedItem.posX
    const overlapZ = posZ < placedItem.posZ + placedItem.length && posZ + itemLength > placedItem.posZ

    if (overlapX && overlapZ) {
      return true
    }
  }
  return false
}

/**
 * Check if an item at the given position would be fully supported by items below.
 * An item is fully supported if its entire footprint is covered by stackable items
 * whose tops are at exactly the given Y level.
 */
function isFullySupported(
  posX: number,
  posZ: number,
  width: number,
  length: number,
  atY: number,
  placed: PlacedCargo[],
): boolean {
  // Get all stackable items whose top is at this Y level
  const supportingItems = placed.filter((item) => {
    if (!item.stackable) return false
    const itemTop = item.posY + item.height
    return Math.abs(itemTop - atY) < 0.1
  })

  if (supportingItems.length === 0) return false

  // Calculate the footprint area that needs to be supported
  const footprintArea = width * length

  // Calculate how much of the footprint is covered by supporting items
  let coveredArea = 0

  for (const support of supportingItems) {
    // Calculate overlap rectangle
    const overlapMinX = Math.max(posX, support.posX)
    const overlapMaxX = Math.min(posX + width, support.posX + support.width)
    const overlapMinZ = Math.max(posZ, support.posZ)
    const overlapMaxZ = Math.min(posZ + length, support.posZ + support.length)

    if (overlapMaxX > overlapMinX && overlapMaxZ > overlapMinZ) {
      coveredArea += (overlapMaxX - overlapMinX) * (overlapMaxZ - overlapMinZ)
    }
  }

  // Require at least 70% support for stability
  // (This allows items to overhang slightly, which is realistic)
  const supportRatio = coveredArea / footprintArea
  return supportRatio >= 0.7
}

interface SplitParams {
  width: number
  length: number
  height: number
  posX: number
  posY: number
  posZ: number
  stackable: boolean
}

function splitSpace(spaces: Space[], spaceIndex: number, itemPlacement: SplitParams): void {
  const space = spaces[spaceIndex]
  spaces.splice(spaceIndex, 1)

  const rightWidth = space.width - itemPlacement.width
  if (rightWidth > 0) {
    spaces.push({
      posX: space.posX + itemPlacement.width,
      posY: space.posY,
      posZ: space.posZ,
      width: rightWidth,
      length: space.length,
      height: space.height,
    })
  }

  const frontLength = space.length - itemPlacement.length
  if (frontLength > 0) {
    spaces.push({
      posX: space.posX,
      posY: space.posY,
      posZ: space.posZ + itemPlacement.length,
      width: itemPlacement.width,
      length: frontLength,
      height: space.height,
    })
  }

  if (itemPlacement.stackable) {
    const topHeight = space.height - itemPlacement.height
    if (topHeight > 0) {
      spaces.push({
        posX: space.posX,
        posY: space.posY + itemPlacement.height,
        posZ: space.posZ,
        width: itemPlacement.width,
        length: itemPlacement.length,
        height: topHeight,
      })
    }
  }

  spaces.sort((spaceA, spaceB) => {
    if (spaceA.posY !== spaceB.posY) return spaceA.posY - spaceB.posY
    if (spaceA.posZ !== spaceB.posZ) return spaceA.posZ - spaceB.posZ
    return spaceA.posX - spaceB.posX
  })
}
