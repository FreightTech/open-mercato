'use client'

import * as React from 'react'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Truck, ChevronDown, ChevronRight } from 'lucide-react'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'

// Import truck visualization component from frc_console module
import { TruckLoadingVisualization } from '../../frc_console/components/TruckLoadingVisualization'
import type { CargoItem } from '@open-mercato/fms/modules/truck_loading/lib/types'

export interface ConsoleForVisualization {
  id: string
  name: string
  date: string
  truckPresetId: string | null
  truck: { id: string; name: string } | null
  originAirport: { id: string; code: string } | null
  destinationAirport: { id: string; code: string } | null
}

interface ConsoleCargo {
  id: string
  name: string
  width: number
  length: number
  height: number
  weight: number
  quantity: number
  stackable: boolean
  color: string
}

interface ProjectTruckVisualizationSectionProps {
  projectId: string
  consoles: ConsoleForVisualization[]
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

function ConsoleVisualization({ console_ }: { console_: ConsoleForVisualization }) {
  const t = useT()

  // Fetch cargo for this console
  const { data: cargoData, isLoading } = useQuery({
    queryKey: ['frc_console_cargo', console_.id],
    queryFn: async () => {
      const call = await apiCall<{
        items: Array<{
          id: string
          cargoName: string
          quantity: number
          lengthCm: string | null
          widthCm: string | null
          heightCm: string | null
          actualWeightKg: string | null
          stackableType: string
          color: string
        }>
        cargoForVisualization: ConsoleCargo[]
      }>(`/api/frc_console/console/${console_.id}/cargo`)
      if (!call.ok) return { items: [], cargoForVisualization: [] }
      return call.result ?? { items: [], cargoForVisualization: [] }
    },
    enabled: !!console_.id,
  })

  const cargoItems: CargoItem[] = useMemo(() => {
    if (!cargoData?.cargoForVisualization) return []
    return cargoData.cargoForVisualization.map((c) => ({
      id: c.id,
      name: c.name,
      width: c.width,
      length: c.length,
      height: c.height,
      weight: c.weight,
      quantity: c.quantity,
      stackable: c.stackable,
      color: c.color,
    }))
  }, [cargoData])

  const truckPresetId = console_.truckPresetId || 'standard'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (cargoItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <Truck className="h-8 w-8 mb-2 opacity-50" />
        <p>{t('frc_projects.detail.visualization.noCargo', 'No cargo loaded in this console')}</p>
      </div>
    )
  }

  return <TruckLoadingVisualization cargoItems={cargoItems} truckPresetId={truckPresetId} />
}

function ConsoleAccordionItem({ console_ }: { console_: ConsoleForVisualization }) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  const route = `${console_.originAirport?.code ?? '?'} → ${console_.destinationAirport?.code ?? '?'}`
  const truckName = console_.truck?.name ?? t('frc_projects.detail.visualization.noTruck', 'No truck')

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3',
          'text-left bg-muted/30 hover:bg-muted/50 transition-colors',
          isOpen && 'border-b'
        )}
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Truck className="h-5 w-5 text-primary" />
          <div>
            <span className="font-medium">{console_.name}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{truckName}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-sm font-mono text-muted-foreground">{route}</span>
          </div>
        </div>
        <span className="text-sm text-muted-foreground">{formatDate(console_.date)}</span>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div className="p-4">
          <ConsoleVisualization console_={console_} />
        </div>
      )}
    </div>
  )
}

export function ProjectTruckVisualizationSection({
  projectId,
  consoles,
}: ProjectTruckVisualizationSectionProps) {
  const t = useT()

  // Filter consoles that have truck presets (needed for visualization)
  const visualizableConsoles = useMemo(() => {
    return consoles.filter((c) => c.truckPresetId)
  }, [consoles])

  // Empty state
  if (consoles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Truck className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          {t('frc_projects.detail.visualization.noConsoles', 'No consoles to visualize')}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            'frc_projects.detail.visualization.noConsolesHint',
            'Create consoles with truck assignments to see 3D visualizations.'
          )}
        </p>
      </div>
    )
  }

  // No consoles with truck presets
  if (visualizableConsoles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Truck className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          {t(
            'frc_projects.detail.visualization.noTruckPresets',
            'No consoles have truck assignments'
          )}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            'frc_projects.detail.visualization.noTruckPresetsHint',
            'Assign trucks to consoles to enable 3D visualization.'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {visualizableConsoles.map((console_) => (
        <ConsoleAccordionItem key={console_.id} console_={console_} />
      ))}
    </div>
  )
}
