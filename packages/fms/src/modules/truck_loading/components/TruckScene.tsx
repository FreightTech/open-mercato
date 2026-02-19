'use client'

import React, { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useTheme } from '@open-mercato/ui/theme'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TruckContainer } from './TruckContainer'
import { CargoBox } from './CargoBox'
import { UnplacedCargoBox } from './UnplacedCargoBox'
import type { PlacedCargo, TruckPreset, UnplacedCargoDisplay, UnplacedReason } from '../lib/types'

const SCALE = 0.01
const UNPLACED_GAP = 50 // Gap between trailer and unplaced items in cm
const UNPLACED_STACK_GAP = 10 // Gap between stacked unplaced items in cm
const MAX_STACK_HEIGHT = 5 // Maximum items per vertical stack
const GRID_COLUMNS = 5 // Number of columns in the grid (along X axis)
const GRID_ROWS = 5 // Number of rows in the grid (along Z axis)
const STACK_GAP = 20 // Gap between stacks in cm

interface TruckSceneProps {
  truck: TruckPreset
  placedCargo: PlacedCargo[]
  unplacedCargo: UnplacedCargoDisplay[]
  selectedCargoId: string | null
  onSelectCargo: (cargoItemId: string | null) => void
}

export function TruckScene({ truck, placedCargo, unplacedCargo, selectedCargoId, onSelectCargo }: TruckSceneProps) {
  const { resolvedTheme } = useTheme()
  const t = useT()
  const isDark = resolvedTheme === 'dark'

  // Background colors matching Tailwind slate palette
  const bgColor = isDark ? '#0f172a' : '#f8fafc' // slate-900 / slate-50

  const truckCenterX = (truck.width / 2) * SCALE
  const truckCenterZ = (truck.length / 2) * SCALE
  const truckMaxDim = Math.max(truck.width, truck.length, truck.height) * SCALE

  const cameraDistance = truckMaxDim * 1.3
  const cameraX = truckCenterX + cameraDistance * 0.6
  const cameraY = cameraDistance * 0.5
  const cameraZ = truckCenterZ + cameraDistance * 0.4

  // Helper to get reason label
  const getReasonLabel = (reason: UnplacedReason): string => {
    switch (reason) {
      case 'weight_exceeded':
        return t('truck_loading.unplacedItems.reason.weight_exceeded')
      case 'no_space':
        return t('truck_loading.unplacedItems.reason.no_space')
      default:
        return reason
    }
  }

  // Calculate stacked positions for unplaced items in a 5x5 grid to the left of trailer
  // Each grid cell contains a stack of up to 5 items (total max: 5x5x5 = 125 items)
  const unplacedPositions = useMemo(() => {
    const positions: Array<{ item: UnplacedCargoDisplay; posX: number; posY: number; posZ: number }> = []

    // Calculate average dimensions for consistent grid spacing
    // Use first item dimensions as reference (or defaults if no items)
    const refWidth = unplacedCargo[0]?.width ?? 100
    const refLength = unplacedCargo[0]?.length ?? 100
    const refHeight = unplacedCargo[0]?.height ?? 100

    for (let i = 0; i < unplacedCargo.length; i++) {
      const item = unplacedCargo[i]

      // Calculate which stack this item belongs to and its position within the stack
      const stackIndex = Math.floor(i / MAX_STACK_HEIGHT) // Which stack (0, 1, 2, ...)
      const itemInStack = i % MAX_STACK_HEIGHT // Position within stack (0-4)

      // Calculate grid position (5 columns x 5 rows)
      const col = stackIndex % GRID_COLUMNS // Column (0-4)
      const row = Math.floor(stackIndex / GRID_COLUMNS) % GRID_ROWS // Row (0-4)

      // Position to the left of the trailer (negative X)
      // Columns go from right to left (col 0 closest to trailer)
      const posX = -((col + 1) * (refWidth + STACK_GAP) + UNPLACED_GAP)

      // Position along Z axis (rows extend from front of trailer)
      const posZ = row * (refLength + STACK_GAP)

      // Stack vertically within each grid cell
      const posY = itemInStack * (refHeight + UNPLACED_STACK_GAP)

      positions.push({
        item,
        posX,
        posY,
        posZ,
      })
    }

    return positions
  }, [unplacedCargo])

  return (
    <div className="w-full h-full">
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => onSelectCargo(null)}
      >
        {/* Scene background color */}
        <color attach="background" args={[bgColor]} />

        <PerspectiveCamera
          makeDefault
          position={[cameraX, cameraY, cameraZ]}
          fov={50}
          near={0.1}
          far={1000}
        />
        <OrbitControls
          target={[truckCenterX, (truck.height / 2) * SCALE * 0.3, truckCenterZ]}
          enableDamping
          dampingFactor={0.1}
          minDistance={1}
          maxDistance={truckMaxDim * 3}
        />

        {/* Lighting - brighter in light mode */}
        <ambientLight intensity={isDark ? 0.5 : 0.7} />
        <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow />
        <directionalLight position={[-5, 10, -5]} intensity={0.3} />

        {/* Truck container wireframe */}
        <TruckContainer truck={truck} isDark={isDark} />

        {/* Placed cargo items */}
        {placedCargo.map((item, index) => (
          <CargoBox
            key={`${item.cargoItemId}-${item.instanceIndex}-${index}`}
            item={item}
            selected={selectedCargoId === item.cargoItemId}
            onSelect={onSelectCargo}
            isDark={isDark}
          />
        ))}

        {/* Unplaced cargo items (stacked beside trailer) */}
        {unplacedPositions.map(({ item, posX, posY, posZ }, index) => (
          <UnplacedCargoBox
            key={`unplaced-${item.cargoItemId}-${item.instanceIndex}-${index}`}
            item={item}
            positionX={posX * SCALE}
            positionY={posY * SCALE}
            positionZ={posZ * SCALE}
            isDark={isDark}
            reasonLabel={getReasonLabel(item.reason)}
          />
        ))}
      </Canvas>
    </div>
  )
}
