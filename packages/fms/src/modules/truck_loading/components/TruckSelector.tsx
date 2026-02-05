'use client'

import React from 'react'
import { TRUCK_PRESETS } from '../lib/truck-presets'
import type { TruckPreset } from '../lib/types'

interface TruckSelectorProps {
  selectedTruck: TruckPreset
  onSelect: (truck: TruckPreset) => void
}

export function TruckSelector({ selectedTruck, onSelect }: TruckSelectorProps) {
  return (
    <select
      value={selectedTruck.id}
      onChange={(event) => {
        const truck = TRUCK_PRESETS.find((preset) => preset.id === event.target.value)
        if (truck) onSelect(truck)
      }}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
    >
      {TRUCK_PRESETS.map((truck) => (
        <option key={truck.id} value={truck.id}>
          {truck.label} ({truck.width}x{truck.length}x{truck.height}cm, {(truck.maxWeight / 1000).toFixed(0)}t)
        </option>
      ))}
    </select>
  )
}
