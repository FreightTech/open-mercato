'use client'

import React from 'react'
import { Edges, Grid } from '@react-three/drei'
import type { TruckPreset } from '../lib/types'

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
    </group>
  )
}
