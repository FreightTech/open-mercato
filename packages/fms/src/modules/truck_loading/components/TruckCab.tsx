'use client'

import React from 'react'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'
import type { TruckCabConfig } from '../lib/types'

const SCALE = 0.01

interface TruckCabProps {
  cab: TruckCabConfig
  trailerWidth: number
  trailerLength: number
  isDark: boolean
}

export function TruckCab({ cab, trailerWidth, trailerLength, isDark }: TruckCabProps) {
  const scaledCabWidth = cab.width * SCALE
  const scaledCabLength = cab.length * SCALE
  const scaledCabHeight = cab.height * SCALE
  const scaledGap = cab.gapFromTrailer * SCALE
  const scaledTrailerLength = trailerLength * SCALE
  const scaledTrailerWidth = trailerWidth * SCALE

  // Colors - solid cab like Loggy (higher opacity than trailer)
  const cabColor = isDark ? '#60a5fa' : '#3b82f6' // blue-400 / blue-500
  const cabFillOpacity = isDark ? 0.5 : 0.4 // More solid than trailer
  const glassColor = isDark ? '#1e3a8a' : '#1e40af' // blue-900 / blue-800
  const glassOpacity = isDark ? 0.7 : 0.6
  const wheelColor = isDark ? '#334155' : '#64748b' // slate-700 / slate-500

  // Wheel dimensions
  const wheelRadius = 55 * SCALE
  const wheelWidth = 35 * SCALE

  // Cab positioning - aligned with trailer (bottom at Y=0, same as trailer floor)
  const cabCenterX = scaledTrailerWidth / 2
  const cabCenterZ = scaledTrailerLength + scaledGap + scaledCabLength / 2

  // Cab body - bottom at Y=0 to match trailer floor level
  const cabBottomY = 0
  const cabCenterY = cabBottomY + scaledCabHeight / 2

  // Wheel positioning - center at Y=0 (half overlaps cab bottom), center at cab edge (half in, half out)
  const wheelYPos = 0
  const wheelZPos = cabCenterZ
  const wheelXOffset = scaledCabWidth / 2

  // Windshield (glass) - flat rectangle on the front face of the cab
  const glassHeight = scaledCabHeight * 0.45
  const glassWidth = scaledCabWidth * 0.85
  const glassY = cabBottomY + scaledCabHeight * 0.65 // Upper portion of cab
  const glassZ = cabCenterZ + scaledCabLength / 2 + 0.01 // Slightly in front of cab face

  return (
    <group>
      {/* Main cab body - simple solid box (Loggy style) */}
      <mesh position={[cabCenterX, cabCenterY, cabCenterZ]}>
        <boxGeometry args={[scaledCabWidth, scaledCabHeight, scaledCabLength]} />
        <meshStandardMaterial
          color={cabColor}
          transparent
          opacity={cabFillOpacity}
          depthWrite={false}
        />
        <Edges linewidth={1.5} color={cabColor} />
      </mesh>

      {/* Windshield (glass) - flat on front face */}
      <mesh
        position={[cabCenterX, glassY, glassZ]}
        rotation={[0, 0, 0]}
      >
        <planeGeometry args={[glassWidth, glassHeight]} />
        <meshStandardMaterial
          color={glassColor}
          transparent
          opacity={glassOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Left wheel */}
      <mesh
        position={[cabCenterX - wheelXOffset, wheelYPos, wheelZPos]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
        <meshStandardMaterial color={wheelColor} />
      </mesh>

      {/* Right wheel */}
      <mesh
        position={[cabCenterX + wheelXOffset, wheelYPos, wheelZPos]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
        <meshStandardMaterial color={wheelColor} />
      </mesh>
    </group>
  )
}
