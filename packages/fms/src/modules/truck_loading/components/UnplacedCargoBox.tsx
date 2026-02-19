'use client'

import React, { useRef, useState } from 'react'
import { Edges, Html } from '@react-three/drei'
import type { Mesh } from 'three'
import type { UnplacedCargoDisplay } from '../lib/types'

const SCALE = 0.01

interface UnplacedCargoBoxProps {
  item: UnplacedCargoDisplay
  positionX: number
  positionY: number
  positionZ: number
  isDark: boolean
  reasonLabel: string
}

export function UnplacedCargoBox({ item, positionX, positionY, positionZ, isDark, reasonLabel }: UnplacedCargoBoxProps) {
  const meshRef = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)

  const scaledWidth = item.width * SCALE
  const scaledHeight = item.height * SCALE
  const scaledLength = item.length * SCALE

  // Center the box at the given position
  const centerX = positionX + (item.width / 2) * SCALE
  const centerY = positionY + (item.height / 2) * SCALE
  const centerZ = positionZ + (item.length / 2) * SCALE

  // Gray/outline style colors
  const boxColor = isDark ? '#475569' : '#94a3b8' // slate-600 / slate-400
  const edgeColor = isDark ? '#64748b' : '#64748b' // slate-500
  const hoveredEdgeColor = isDark ? '#f87171' : '#ef4444' // red-400 / red-500

  // Tooltip colors based on theme
  const tooltipBg = isDark ? '#1e293b' : '#ffffff'
  const tooltipColor = isDark ? '#f8fafc' : '#1e293b'
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0'
  const tooltipShadow = isDark
    ? '0 4px 6px -1px rgba(0,0,0,0.3)'
    : '0 4px 6px -1px rgba(0,0,0,0.1)'

  return (
    <mesh
      ref={meshRef}
      position={[centerX, centerY, centerZ]}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      <boxGeometry args={[scaledWidth, scaledHeight, scaledLength]} />
      <meshStandardMaterial
        color={boxColor}
        transparent
        opacity={hovered ? 0.4 : 0.25}
        depthWrite={false}
      />
      <Edges
        linewidth={hovered ? 2 : 1}
        color={hovered ? hoveredEdgeColor : edgeColor}
      />
      {hovered && (
        <Html
          center
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              background: tooltipBg,
              color: tooltipColor,
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              lineHeight: 1.4,
              fontFamily: 'system-ui, sans-serif',
              border: `1px solid ${tooltipBorder}`,
              boxShadow: tooltipShadow,
            }}
          >
            <div style={{ fontWeight: 600 }}>{item.name}</div>
            <div style={{ opacity: 0.8 }}>{item.width}x{item.length}x{item.height} cm</div>
            <div style={{ opacity: 0.8 }}>{item.weight} kg</div>
            <div style={{ color: '#ef4444', marginTop: 4, fontWeight: 500 }}>{reasonLabel}</div>
          </div>
        </Html>
      )}
    </mesh>
  )
}
