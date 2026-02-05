'use client'

import React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useTheme } from '@open-mercato/ui/theme'
import { TruckContainer } from './TruckContainer'
import { CargoBox } from './CargoBox'
import type { PlacedCargo, TruckPreset } from '../lib/types'

const SCALE = 0.01

interface TruckSceneProps {
  truck: TruckPreset
  placedCargo: PlacedCargo[]
  selectedCargoId: string | null
  onSelectCargo: (cargoItemId: string | null) => void
}

export function TruckScene({ truck, placedCargo, selectedCargoId, onSelectCargo }: TruckSceneProps) {
  const { resolvedTheme } = useTheme()
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
      </Canvas>
    </div>
  )
}
