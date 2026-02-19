'use client'

import * as React from 'react'
import { useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { FileText, Package, Box, ArrowLeft, Trash2, Truck, Plus, Plane } from 'lucide-react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { TruckLoadingVisualization } from '../../../components/TruckLoadingVisualization'
import { ConsoleDetailsEditTable, type ConsoleDetailsData } from '../../../components/ConsoleDetailsEditTable'
import { ConsoleCargoInlineTable, type ConsoleCargoItemData, type ConsoleCargoInlineTableHandle } from '../../../components/ConsoleCargoInlineTable'

// Import CollapsibleSection from frc_offers module (shared component)
import { CollapsibleSection } from '../../../../frc_offers/components/CollapsibleSection'

interface ConsoleDetail {
  id: string
  name: string
  customName: string | null
  date: string
  status: string
  truckPresetId: string | null
  notes: string | null
  truck: { id: string; name: string } | null
  project: { id: string; number: string } | null
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

// Status badge variant mapping
const statusVariants: Record<string, 'default' | 'secondary' | 'outline'> = {
  planning: 'secondary',
  loading: 'default',
  completed: 'outline',
}

export default function ConsoleDetailPage({ params: propsParams }: DetailPageProps) {
  const t = useT()
  const router = useRouter()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const queryClient = useQueryClient()

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false)

  // Table refs for cross-table navigation
  const detailsTableRef = useRef<HTMLDivElement>(null)
  const cargoTableRef = useRef<HTMLDivElement>(null)
  const cargoInlineTableRef = useRef<ConsoleCargoInlineTableHandle>(null)

  // Get consoleId from props params (passed by catch-all route) or fallback to useParams
  const consoleId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  // Fetch console details
  const { data: consoleData, isLoading: isLoadingConsole, error } = useQuery({
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
  const handleFieldSave = useCallback(async (field: string, value: unknown) => {
    await updateConsoleMutation.mutateAsync({ field, value })
  }, [updateConsoleMutation])

  const handleDelete = useCallback(async () => {
    if (!consoleId) return
    const confirmed = window.confirm(t('frc_console.detail.deleteConfirm', 'Are you sure you want to delete this console? Cargo items will not be deleted.'))
    if (!confirmed) return

    setIsDeleting(true)
    try {
      const call = await apiCall(`/api/frc_console/console/${consoleId}`, {
        method: 'DELETE',
      })
      if (call.ok) {
        flash(t('frc_console.detail.deleteSuccess', 'Console deleted'), 'success')
        queryClient.invalidateQueries({ queryKey: ['frc_console'] })
        router.push('/backend/frc-console')
      } else {
        const errorResult = call.result as { error?: string } | undefined
        flash(errorResult?.error || t('frc_console.detail.deleteError', 'Failed to delete'), 'error')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      flash(errorMessage, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [consoleId, queryClient, router, t])

  const handleAddCargo = useCallback(() => {
    cargoInlineTableRef.current?.addRow()
  }, [])

  // Loading state
  if (!consoleId || isLoadingConsole) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-[50vh] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="h-6 w-6" />
            <span>{t('frc_console.detail.loading', 'Loading console...')}</span>
          </div>
        </PageBody>
      </Page>
    )
  }

  // Error state
  if (error || !consoleData) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
            <Truck className="h-12 w-12 opacity-50" />
            <p>{t('frc_console.detail.notFound', 'Console not found')}</p>
            <Button variant="outline" onClick={() => router.push('/backend/frc-console')}>
              {t('frc_console.detail.backToList', 'Back to Console List')}
            </Button>
          </div>
        </PageBody>
      </Page>
    )
  }

  const cargoItems = cargoData?.items ?? []
  const cargoForVisualization = cargoData?.cargoForVisualization ?? []

  // Prepare data for components
  const detailsData: ConsoleDetailsData = {
    id: consoleData.id,
    name: consoleData.name,
    customName: consoleData.customName,
    date: consoleData.date,
    status: consoleData.status,
    notes: consoleData.notes,
    truck: consoleData.truck,
    project: consoleData.project,
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

  // Format date
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* Back button */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/backend/frc-console')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('frc_console.detail.back', 'Back')}
            </Button>
          </div>

          {/* Header Card */}
          <div className="border rounded-lg p-6 bg-card">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold">{consoleData.name}</h1>
                    <Badge variant={statusVariants[consoleData.status] || 'secondary'}>
                      {consoleData.status}
                    </Badge>
                  </div>
                  {(consoleData.originAirport || consoleData.destinationAirport) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Plane className="w-4 h-4" />
                      <span>
                        {consoleData.originAirport?.code || '—'} → {consoleData.destinationAirport?.code || '—'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {consoleData.truck && (
                      <span>{consoleData.truck.name}</span>
                    )}
                    <span>{formatDate(consoleData.date)}</span>
                    <span>{cargoItems.length} {t('frc_console.detail.cargoItems', 'cargo items')}</span>
                  </div>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <Spinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>

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
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddCargo}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                {t('frc_console.detail.cargo.addRow', 'Add Cargo')}
              </Button>
            }
          >
            {isLoadingCargo ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : (
              <ConsoleCargoInlineTable
                ref={cargoInlineTableRef}
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
      </PageBody>
    </Page>
  )
}
