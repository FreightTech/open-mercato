'use client'

interface ConnectionLineOverlayProps {
  from: { x: number; y: number }
  to: { x: number; y: number }
}

export function ConnectionLineOverlay({ from, to }: ConnectionLineOverlayProps) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const cpOffset = Math.min(Math.max(Math.abs(dx) * 0.5, 30), 120)

  return (
    <svg
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <defs>
        <marker
          id="drag-connection-arrow"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="10"
          markerHeight="10"
          orient="auto"
        >
          <path d="M 2 2 L 10 6 L 2 10" stroke="#888" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </marker>
      </defs>
      <path
        d={`M ${from.x} ${from.y} C ${from.x + cpOffset} ${from.y}, ${to.x - cpOffset} ${to.y}, ${to.x} ${to.y}`}
        stroke="#888"
        strokeWidth={2}
        fill="none"
        markerEnd="url(#drag-connection-arrow)"
      />
    </svg>
  )
}
