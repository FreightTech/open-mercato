'use client'

import * as React from 'react'
import { useMemo, useState } from 'react'
import { TruckScene } from '@open-mercato/fms/modules/truck_loading/components/TruckScene'
import { LoadingMetricsPanel } from '@open-mercato/fms/modules/truck_loading/components/LoadingMetricsPanel'
import { packCargo } from '@open-mercato/fms/modules/truck_loading/lib/packing-algorithm'
import { calculateMetrics } from '@open-mercato/fms/modules/truck_loading/lib/metrics'
import { TRUCK_PRESETS } from '@open-mercato/fms/modules/truck_loading/lib/truck-presets'
import type {
  CargoItem,
  TruckPreset,
  TruckLoadingSettings,
  UnplacedCargoDisplay,
} from '@open-mercato/fms/modules/truck_loading/lib/types'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Label } from '@open-mercato/ui/primitives/label'

interface TruckLoadingVisualizationProps {
  cargoItems: CargoItem[]
  truckPresetId: string
}

export function TruckLoadingVisualization({ cargoItems, truckPresetId }: TruckLoadingVisualizationProps) {
  const [selectedCargoId, setSelectedCargoId] = useState<string | null>(null)
  const [autoStack, setAutoStack] = useState(true)

  // Find the truck preset
  const truck = useMemo<TruckPreset>(() => {
    const found = TRUCK_PRESETS.find((p) => p.id === truckPresetId)
    return found ?? TRUCK_PRESETS[0]
  }, [truckPresetId])

  // Settings for packing
  const settings = useMemo<TruckLoadingSettings>(() => ({ autoStack }), [autoStack])

  // Run bin-packing algorithm
  const packingResult = useMemo(() => {
    if (cargoItems.length === 0) {
      return { placed: [], unplaced: [] }
    }
    return packCargo(truck, cargoItems, settings)
  }, [truck, cargoItems, settings])

  // Calculate metrics
  const metrics = useMemo(() => {
    return calculateMetrics(truck, cargoItems, packingResult.placed)
  }, [truck, cargoItems, packingResult.placed])

  // Build unplaced cargo display items
  const unplacedDisplay = useMemo<UnplacedCargoDisplay[]>(() => {
    return packingResult.unplaced.map((item) => {
      const source = cargoItems.find((c) => c.id === item.cargoItemId)
      return {
        cargoItemId: item.cargoItemId,
        instanceIndex: item.instanceIndex,
        name: item.name,
        width: source?.width ?? 100,
        length: source?.length ?? 100,
        height: source?.height ?? 100,
        weight: source?.weight ?? 0,
        color: source?.color ?? '#888888',
        reason: item.reason === 'weight_exceeded' ? 'weight_exceeded' : 'no_space',
      }
    })
  }, [packingResult.unplaced, cargoItems])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="auto-stack" checked={autoStack} onCheckedChange={setAutoStack} />
          <Label htmlFor="auto-stack" className="text-sm cursor-pointer">
            Auto-stack cargo
          </Label>
        </div>
        <div className="text-sm text-muted-foreground">
          Truck: {truck.label} ({truck.width}x{truck.length}x{truck.height} cm)
        </div>
      </div>

      {/* Metrics */}
      <LoadingMetricsPanel metrics={metrics} />

      {/* 3D Scene */}
      <div className="h-[500px] rounded-lg border bg-muted/20 overflow-hidden">
        <TruckScene
          truck={truck}
          placedCargo={packingResult.placed}
          unplacedCargo={unplacedDisplay}
          selectedCargoId={selectedCargoId}
          onSelectCargo={setSelectedCargoId}
        />
      </div>

      {/* Unplaced items warning */}
      {unplacedDisplay.length > 0 && (
        <div className="p-3 rounded-md bg-amber-100 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {unplacedDisplay.length} item(s) could not be placed:{' '}
            {unplacedDisplay.map((item) => `${item.name} (${item.reason === 'weight_exceeded' ? 'weight limit' : 'no space'})`).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}
