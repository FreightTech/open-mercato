'use client'

import React, { useRef, useState } from 'react'
import { Edges, Html } from '@react-three/drei'
import type { Mesh } from 'three'
import type { PlacedCargo } from '../lib/types'

const SCALE = 0.01

interface CargoBoxProps {
  item: PlacedCargo
  selected: boolean
  onSelect: (cargoItemId: string) => void
  isDark: boolean
}

export function CargoBox({ item, selected, onSelect, isDark }: CargoBoxProps) {
  const meshRef = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)

  const scaledWidth = item.width * SCALE
  const scaledHeight = item.height * SCALE
  const scaledLength = item.length * SCALE

  const positionX = (item.posX + item.width / 2) * SCALE
  const positionY = (item.posY + item.height / 2) * SCALE
  const positionZ = (item.posZ + item.length / 2) * SCALE

  const opacity = selected ? 0.9 : hovered ? 0.8 : 0.65

  // Edge colors based on theme
  const defaultEdgeColor = isDark ? '#94a3b8' : '#475569' // slate-400 / slate-600
  const selectedEdgeColor = isDark ? '#ffffff' : '#1e293b' // white / slate-800

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
      position={[positionX, positionY, positionZ]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(item.cargoItemId)
      }}
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
        color={item.color}
        transparent
        opacity={opacity}
      />
      <Edges
        linewidth={selected ? 2 : 1}
        color={selected ? selectedEdgeColor : defaultEdgeColor}
      />
      {(hovered || selected) && (
        <Html
          center
          distanceFactor={8}
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
          </div>
        </Html>
      )}
    </mesh>
  )
}
