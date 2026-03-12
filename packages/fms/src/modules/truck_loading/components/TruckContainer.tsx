'use client'

import React from 'react'
import { Edges, Grid } from '@react-three/drei'
import type { TruckPreset } from '../lib/types'
import { TruckCab } from './TruckCab'

const SCALE = 0.01

interface TruckContainerProps {
  truck: TruckPreset
  isDark: boolean
}

export function TruckContainer({ truck, isDark }: TruckContainerProps) {
  const scaledWidth = truck.width * SCALE
  const scaledHeight = truck.height * SCALE
  const scaledLength = truck.length * SCALE

  const centerX = scaledWidth / 2
  const centerY = scaledHeight / 2
  const centerZ = scaledLength / 2

  // Soft blue wireframe colors based on theme
  const wireframeColor = isDark ? '#60a5fa' : '#3b82f6' // blue-400 / blue-500
  const wireframeFillOpacity = isDark ? 0.06 : 0.04
  const floorColor = isDark ? '#1e293b' : '#f1f5f9' // slate-800 / slate-100
  const gridCellColor = isDark ? '#334155' : '#cbd5e1' // slate-700 / slate-300
  const gridSectionColor = isDark ? '#475569' : '#94a3b8' // slate-600 / slate-400
  const wheelColor = isDark ? '#334155' : '#64748b' // slate-700 / slate-500

  // Trailer wheel dimensions (same as cab wheels for consistency)
  const wheelRadius = 55 * SCALE
  const wheelWidth = 35 * SCALE

  // Wheel positioning - wheels half inside trailer (center at trailer floor level and edge)
  const wheelYPos = 0 // Wheel center at trailer floor level (half overlaps trailer bottom)

  // Trailer wheel positions - rear axle at ~10% from the back of the trailer
  const trailerWheelZPos = scaledLength * 0.1 // Near the rear (Z=0 is the back)
  const wheelXOffset = scaledWidth / 2 // Wheels centered at trailer edge (half in, half out)

  return (
    <group>
      {/* Container wireframe */}
      <mesh position={[centerX, centerY, centerZ]}>
        <boxGeometry args={[scaledWidth, scaledHeight, scaledLength]} />
        <meshStandardMaterial
          color={wireframeColor}
          transparent
          opacity={wireframeFillOpacity}
          depthWrite={false}
        />
        <Edges linewidth={1.5} color={wireframeColor} />
      </mesh>

      {/* Floor grid */}
      <Grid
        position={[centerX, 0.001, centerZ]}
        args={[scaledWidth, scaledLength]}
        cellSize={1 * SCALE}
        cellThickness={0.3}
        cellColor={gridCellColor}
        sectionSize={100 * SCALE}
        sectionThickness={0.6}
        sectionColor={gridSectionColor}
        fadeDistance={50}
        infiniteGrid={false}
      />

      {/* Floor plane (subtle solid floor) */}
      <mesh position={[centerX, 0, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[scaledWidth, scaledLength]} />
        <meshStandardMaterial
          color={floorColor}
          transparent
          opacity={isDark ? 0.5 : 0.8}
        />
      </mesh>

      {/* Trailer wheels - only for truck types with cab (semi-trailers) */}
      {truck.cab && (
        <>
          {/* Left wheel (rear axle) */}
          <mesh
            position={[
              centerX - wheelXOffset,
              wheelYPos,
              trailerWheelZPos,
            ]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
            <meshStandardMaterial color={wheelColor} />
          </mesh>

          {/* Right wheel (rear axle) */}
          <mesh
            position={[
              centerX + wheelXOffset,
              wheelYPos,
              trailerWheelZPos,
            ]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
            <meshStandardMaterial color={wheelColor} />
          </mesh>
        </>
      )}

      {/* Truck cab - only rendered for presets with cab configuration */}
      {truck.cab && (
        <TruckCab
          cab={truck.cab}
          trailerWidth={truck.width}
          trailerLength={truck.length}
          isDark={isDark}
        />
      )}
    </group>
  )
}
