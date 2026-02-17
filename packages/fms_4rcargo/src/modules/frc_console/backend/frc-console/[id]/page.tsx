'use client'

import * as React from 'react'
import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, Truck } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { TruckLoadingVisualization } from '../../../components/TruckLoadingVisualization'
import { ConsoleCargoTable } from '../../../components/ConsoleCargoTable'
import { AddCargoDialog } from '../../../components/AddCargoDialog'

interface ConsoleDetail {
  id: string
  name: string
  date: string
  status: string
  truckPresetId: string
  notes: string | null
  truck: { id: string; name: string } | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  itemCount: number
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

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  planning: 'secondary',
  confirmed: 'default',
  loaded: 'default',
  completed: 'outline',
}

type DetailPageProps = {
  params?: { id?: string }
}

export default function ConsoleDetailPage({ params: propsParams }: DetailPageProps) {
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const router = useRouter()
  const [showAddCargo, setShowAddCargo] = React.useState(false)

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
  const { data: cargoData, isLoading: isLoadingCargo, refetch: refetchCargo } = useQuery({
    queryKey: ['frc_console_cargo', consoleId],
    queryFn: async () => {
      const call = await apiCall<CargoResponse>(`/api/frc_console/console/${consoleId}/cargo`)
      if (!call.ok) throw new Error('Failed to load cargo')
      return call.result
    },
    enabled: !!consoleId,
  })

  const cargoItems = useMemo(() => cargoData?.cargoForVisualization ?? [], [cargoData])
  const cargoTableItems = useMemo(() => cargoData?.items ?? [], [cargoData])

  const handleAddCargoSuccess = () => {
    setShowAddCargo(false)
    refetchCargo()
  }

  if (isLoadingConsole) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!consoleData) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Console not found</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/backend/frc-console')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{consoleData.name}</h1>
            <Badge variant={STATUS_COLORS[consoleData.status] ?? 'secondary'}>
              {consoleData.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {consoleData.truck?.name ?? 'No truck'} | {new Date(consoleData.date).toLocaleDateString()} |{' '}
            {consoleData.originAirport?.code ?? '?'} - {consoleData.destinationAirport?.code ?? '?'}
          </p>
        </div>
        <Button onClick={() => setShowAddCargo(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Cargo
        </Button>
      </div>

      {/* Cargo Table */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Cargo Items ({cargoTableItems.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoadingCargo ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : cargoTableItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No cargo items. Click &quot;Add Cargo&quot; to add packages from bookings.
            </p>
          ) : (
            <ConsoleCargoTable items={cargoTableItems} onRemove={() => refetchCargo()} consoleId={consoleId} />
          )}
        </CardContent>
      </Card>

      {/* 3D Visualization */}
      {cargoItems.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Loading Visualization</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <TruckLoadingVisualization
              cargoItems={cargoItems}
              truckPresetId={consoleData.truckPresetId}
            />
          </CardContent>
        </Card>
      )}

      {/* Add Cargo Dialog */}
      <AddCargoDialog
        open={showAddCargo}
        onOpenChange={setShowAddCargo}
        onSuccess={handleAddCargoSuccess}
        consoleId={consoleId}
      />
    </div>
  )
}
