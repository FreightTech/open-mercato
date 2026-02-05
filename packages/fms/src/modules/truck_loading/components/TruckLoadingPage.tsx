'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Label } from '@open-mercato/ui/primitives/label'
import { Card, CardContent } from '@open-mercato/ui/primitives/card'
import { SimpleTooltip, TooltipProvider } from '@open-mercato/ui/primitives/tooltip'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TruckScene } from './TruckScene'
import { TruckSelector } from './TruckSelector'
import { CargoTable } from './CargoTable'
import { LoadingMetricsPanel } from './LoadingMetricsPanel'
import { packCargo } from '../lib/packing-algorithm'
import { calculateMetrics } from '../lib/metrics'
import { getDefaultTruck } from '../lib/truck-presets'
import { resetColorIndex } from '../lib/colors'
import type { CargoItem, TruckPreset, TruckLoadingSettings } from '../lib/types'

export function TruckLoadingPage() {
  const t = useT()
  const [truck, setTruck] = useState<TruckPreset>(getDefaultTruck)
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([])
  const [selectedCargoId, setSelectedCargoId] = useState<string | null>(null)
  const [settings, setSettings] = useState<TruckLoadingSettings>({ autoStack: true })

  const packingResult = useMemo(
    () => packCargo(truck, cargoItems, settings),
    [truck, cargoItems, settings],
  )

  const metrics = useMemo(
    () => calculateMetrics(truck, cargoItems, packingResult.placed),
    [truck, cargoItems, packingResult.placed],
  )

  const handleAddCargo = useCallback((item: CargoItem) => {
    setCargoItems((prev) => [...prev, item])
  }, [])

  const handleUpdateCargo = useCallback((cargoId: string, field: string, value: unknown) => {
    setCargoItems((prev) =>
      prev.map((item) =>
        item.id === cargoId ? { ...item, [field]: value } : item,
      ),
    )
  }, [])

  const handleRemoveCargo = useCallback((cargoItemId: string) => {
    setCargoItems((prev) => prev.filter((item) => item.id !== cargoItemId))
    if (selectedCargoId === cargoItemId) {
      setSelectedCargoId(null)
    }
  }, [selectedCargoId])

  const handleReset = useCallback(() => {
    setCargoItems([])
    setSelectedCargoId(null)
    resetColorIndex()
  }, [])

  return (
    <div className="flex flex-col">
      {/* Top toolbar */}
      <div className="shrink-0 bg-background px-4 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <TruckSelector selectedTruck={truck} onSelect={setTruck} />

          <TooltipProvider>
            <SimpleTooltip content={t('truck_loading.autoStack.tooltip')} side="top">
              <div className="flex items-center gap-1.5">
                <Switch
                  id="auto-stack-toggle"
                  checked={settings.autoStack}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, autoStack: checked === true }))
                  }
                />
                <Label htmlFor="auto-stack-toggle" className="text-xs cursor-pointer whitespace-nowrap flex items-center gap-1">
                  {t('truck_loading.autoStack.label')}
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </Label>
              </div>
            </SimpleTooltip>
          </TooltipProvider>

          {cargoItems.length > 0 && (
            <>
              <div className="h-5 w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
              >
                Reset
              </Button>
            </>
          )}

          {packingResult.unplaced.length > 0 && (
            <span className="text-xs text-destructive font-medium">
              {packingResult.unplaced.length} item{packingResult.unplaced.length > 1 ? 's' : ''} could not be placed
            </span>
          )}
        </div>
      </div>

      {/* Cargo table */}
      <div className="shrink-0 px-4">
        <CargoTable
          items={cargoItems}
          selectedCargoId={selectedCargoId}
          onSelect={setSelectedCargoId}
          onAdd={handleAddCargo}
          onUpdate={handleUpdateCargo}
          onRemove={handleRemoveCargo}
        />
      </div>

      {/* Metrics card */}
      {cargoItems.length > 0 && (
        <div className="shrink-0 px-4 pt-3">
          <Card className="py-2.5 shadow-none">
            <CardContent className="px-4 py-0">
              <LoadingMetricsPanel metrics={metrics} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3D viewport */}
      <div className="px-4 pt-3 pb-4">
        <div className="rounded-lg border overflow-hidden" style={{ height: 500, minHeight: 500 }}>
          <TruckScene
            truck={truck}
            placedCargo={packingResult.placed}
            selectedCargoId={selectedCargoId}
            onSelectCargo={setSelectedCargoId}
          />
        </div>
      </div>
    </div>
  )
}
