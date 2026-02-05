const CARGO_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // purple
  '#eab308', // yellow
  '#6366f1', // indigo
]

let colorIndex = 0

export function getNextColor(): string {
  const color = CARGO_COLORS[colorIndex % CARGO_COLORS.length]
  colorIndex++
  return color
}

export function resetColorIndex(): void {
  colorIndex = 0
}
