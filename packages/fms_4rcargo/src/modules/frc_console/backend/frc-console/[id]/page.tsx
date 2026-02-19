'use client'

import * as React from 'react'
import { useRef } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { FileText, Package, Box } from 'lucide-react'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { TruckLoadingVisualization } from '../../../components/TruckLoadingVisualization'
import { ConsoleDetailsEditTable, type ConsoleDetailsData } from '../../../components/ConsoleDetailsEditTable'
import { ConsoleCargoInlineTable, type ConsoleCargoItemData } from '../../../components/ConsoleCargoInlineTable'

// Import CollapsibleSection from frc_offers module (shared component)
import { CollapsibleSection } from '../../../../frc_offers/components/CollapsibleSection'

interface ConsoleDetail {
  id: string
  name: string
  date: string
  status: string
  truckPresetId: string | null
  notes: string | null
  truck: { id: string; name: string } | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  cargoCount: number
}

interface CargoItem {
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

interface CargoApiItem {
  id: string
  airCargoId: string
  quantity: number
  cargoName: string
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  actualWeightKg: string | null
  stackableType: string
  numberOfPieces: number
  color: string
}

interface CargoResponse {
  items: CargoApiItem[]
  cargoForVisualization: CargoItem[]
}

type DetailPageProps = {
  params?: { id?: string }
}

export default function ConsoleDetailPage({ params: propsParams }: DetailPageProps) {
  const t = useT()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const queryClient = useQueryClient()

  // Table refs for cross-table navigation
  const detailsTableRef = useRef<HTMLDivElement>(null)
  const cargoTableRef = useRef<HTMLDivElement>(null)

  // Get consoleId from props params (passed by catch-all route) or fallback to useParams
  const consoleId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  // Fetch console details
  const { data: consoleData, isLoading: isLoadingConsole } = useQuery({
    queryKey: ['frc_console', consoleId],
    queryFn: async () => {
      const call = await apiCall<ConsoleDetail>(`/api/frc_console/console/${consoleId}`)
      if (!call.ok) throw new Error('Failed to load console')
      return call.result
    },
    enabled: !!consoleId,
  })

  // Fetch cargo items
  const { data: cargoData, isLoading: isLoadingCargo } = useQuery({
    queryKey: ['frc_console_cargo', consoleId],
    queryFn: async () => {
      const call = await apiCall<CargoResponse>(`/api/frc_console/console/${consoleId}/cargo`)
      if (!call.ok) throw new Error('Failed to load cargo')
      return call.result
    },
    enabled: !!consoleId,
  })

  // Update console field mutation
  const updateConsoleMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: unknown }) => {
      const call = await apiCall(`/api/frc_console/console/${consoleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!call.ok) throw new Error('Failed to update console')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_console', consoleId] })
    },
    onError: () => {
      flash(t('frc_console.detail.updateError', 'Failed to update'), 'error')
    },
  })

  // Handlers
  const handleFieldSave = React.useCallback(async (field: string, value: unknown) => {
    await updateConsoleMutation.mutateAsync({ field, value })
  }, [updateConsoleMutation])

  if (isLoadingConsole) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!consoleData) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          {t('frc_console.detail.notFound', 'Console not found')}
        </p>
      </div>
    )
  }

  const cargoItems = cargoData?.items ?? []
  const cargoForVisualization = cargoData?.cargoForVisualization ?? []

  // Prepare data for components
  const detailsData: ConsoleDetailsData = {
    id: consoleData.id,
    name: consoleData.name,
    date: consoleData.date,
    status: consoleData.status,
    notes: consoleData.notes,
    truck: consoleData.truck,
    originAirport: consoleData.originAirport,
    destinationAirport: consoleData.destinationAirport,
  }

  const cargoTableData: ConsoleCargoItemData[] = cargoItems.map((item) => ({
    id: item.id,
    airCargoId: item.airCargoId,
    quantity: item.quantity,
    cargoName: item.cargoName,
    lengthCm: item.lengthCm,
    widthCm: item.widthCm,
    heightCm: item.heightCm,
    actualWeightKg: item.actualWeightKg,
    stackableType: item.stackableType,
    numberOfPieces: item.numberOfPieces,
    color: item.color,
  }))

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Console Details */}
      <CollapsibleSection
        title={t('frc_console.detail.sections.details', 'Console Details')}
        icon={FileText}
        defaultOpen={true}
      >
        <ConsoleDetailsEditTable
          consoleId={consoleData.id}
          data={detailsData}
          onFieldSave={handleFieldSave}
          tableRef={detailsTableRef}
          siblingTableRefs={{ next: cargoTableRef }}
        />
      </CollapsibleSection>

      {/* Cargo Items */}
      <CollapsibleSection
        title={t('frc_console.detail.sections.cargo', 'Cargo Items')}
        icon={Package}
        count={cargoItems.length}
        defaultOpen={true}
      >
        {isLoadingCargo ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <ConsoleCargoInlineTable
            consoleId={consoleId ?? ''}
            items={cargoTableData}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['frc_console_cargo', consoleId] })}
            tableRef={cargoTableRef}
            siblingTableRefs={{ prev: detailsTableRef }}
          />
        )}
      </CollapsibleSection>

      {/* 3D Visualization */}
      {cargoForVisualization.length > 0 && consoleData.truckPresetId && (
        <CollapsibleSection
          title={t('frc_console.detail.sections.visualization', 'Loading Visualization')}
          icon={Box}
          defaultOpen={true}
        >
          <TruckLoadingVisualization
            cargoItems={cargoForVisualization}
            truckPresetId={consoleData.truckPresetId}
          />
        </CollapsibleSection>
      )}


    </div>
  )
}
