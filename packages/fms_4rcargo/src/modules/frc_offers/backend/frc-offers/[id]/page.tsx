'use client'

import * as React from 'react'
import { useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { FileText, Route, DollarSign, Package, Building2 } from 'lucide-react'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { CollapsibleSection } from '../../../components/CollapsibleSection'
import { SendOfferDialog } from '../../../components/SendOfferDialog'
import { OfferHighlights } from '../../../components/OfferHighlights'
import { OfferDetailsEditTable, type OfferDetailsData } from '../../../components/OfferDetailsEditTable'
import { OfferPricingEditTable, type OfferPricingData } from '../../../components/OfferPricingEditTable'
import { OfferCargoTable, type OfferLineData } from '../../../components/OfferCargoTable'
import { OfferRoutingEditTable, type AirRoutingData } from '../../../components/OfferRoutingEditTable'
import { OfferClientSection } from '../../../components/OfferClientSection'

type OfferDetailResponse = {
  id: string
  name: string
  rfqId: string | null
  rfqName: string | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  carrierId: string | null
  status: string
  awbNumber: string | null
  connectionMethod: string | null
  departureDate: string | null
  connectionRatePerKg: string | null
  connectionRateTotal: string | null
  airfreightRatePerKg: string | null
  airfreightRateTotal: string | null
  totalRatePerKg: string | null
  totalRate: string | null
  currencyCode: string
  assignedToId: string | null
  assignedToName: string | null
  organizationId: string
  tenantId: string
  createdAt: string
  updatedAt: string
  airRouting: Array<{
    id: string
    name: string
    type: string
    flightNumber: string | null
    originAirport: { id: string; code: string; city?: string | null } | null
    destinationAirport: { id: string; code: string; city?: string | null } | null
    departureDate: string | null
    departureTime: string | null
    arrivalDate: string | null
    arrivalTime: string | null
  }>
  offerLines: Array<{
    id: string
    name: string
    numberOfPieces: number
    stackableType: string
    lengthCm: string | null
    widthCm: string | null
    heightCm: string | null
    volumeM3: string
    volumetricWeightKg: string
    actualWeightKg: string
    chargeableWeightKg: string
    loadingMetres: string
  }>
}

type DetailPageProps = {
  params?: { id?: string }
}

export default function OfferDetailPage({ params: propsParams }: DetailPageProps) {
  const t = useT()
  const router = useRouter()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const queryClient = useQueryClient()

  // Table refs for cross-table navigation
  const detailsTableRef = useRef<HTMLDivElement>(null)
  const pricingTableRef = useRef<HTMLDivElement>(null)
  const cargoTableRef = useRef<HTMLDivElement>(null)
  const clientTableRef = useRef<HTMLDivElement>(null)
  const routingTableRef = useRef<HTMLDivElement>(null)

  // Dialog states
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false)

  // Get offerId from props params (passed by catch-all route) or fallback to useParams
  const offerId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  // Fetch Offer details
  const { data: offerData, isLoading, error } = useQuery({
    queryKey: ['frc_offer', offerId],
    queryFn: async () => {
      const call = await apiCall<OfferDetailResponse>(`/api/frc_offers/offers/${offerId}`)
      if (!call.ok) throw new Error('Failed to load offer')
      return call.result
    },
    enabled: !!offerId,
  })

  // Update Offer field mutation
  const updateMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: unknown }) => {
      const call = await apiCall(`/api/frc_offers/offers/${offerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!call.ok) throw new Error('Failed to update offer')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_offer', offerId] })
    },
    onError: () => {
      flash(t('frc_offers.detail.updateError', 'Failed to update'), 'error')
    },
  })

  // Routing mutations
  const createRoutingMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const call = await apiCall<{ id: string }>(`/api/frc_offers/offers/${offerId}/routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!call.ok) throw new Error('Failed to create routing')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_offer', offerId] })
    },
    onError: () => {
      flash(t('frc_offers.detail.routing.createError', 'Failed to create routing leg'), 'error')
    },
  })

  const updateRoutingMutation = useMutation({
    mutationFn: async ({ routingId, field, value }: { routingId: string; field: string; value: unknown }) => {
      const call = await apiCall(`/api/frc_offers/offers/${offerId}/routing/${routingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!call.ok) throw new Error('Failed to update routing')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_offer', offerId] })
    },
    onError: () => {
      flash(t('frc_offers.detail.routing.updateError', 'Failed to update routing leg'), 'error')
    },
  })

  const deleteRoutingMutation = useMutation({
    mutationFn: async (routingId: string) => {
      const call = await apiCall(`/api/frc_offers/offers/${offerId}/routing/${routingId}`, {
        method: 'DELETE',
      })
      if (!call.ok) throw new Error('Failed to delete routing')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_offer', offerId] })
      flash(t('frc_offers.detail.routing.deleteSuccess', 'Routing leg deleted'), 'success')
    },
    onError: () => {
      flash(t('frc_offers.detail.routing.deleteError', 'Failed to delete routing leg'), 'error')
    },
  })

  // Delete offer mutation
  const deleteOfferMutation = useMutation({
    mutationFn: async () => {
      const call = await apiCall(`/api/frc_offers/offers/${offerId}`, {
        method: 'DELETE',
      })
      if (!call.ok) throw new Error('Failed to delete offer')
      return call.result
    },
    onSuccess: () => {
      flash(t('frc_offers.actions.delete_success', 'Offer deleted successfully'), 'success')
      router.push('/backend/frc-offers')
    },
    onError: () => {
      flash(t('frc_offers.actions.delete_error', 'Failed to delete offer'), 'error')
    },
  })

  // Offer line mutations
  const createLineMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const call = await apiCall<{ id: string }>(`/api/frc_offers/offers/${offerId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!call.ok) throw new Error('Failed to create cargo')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_offer', offerId] })
      flash(t('frc_offers.detail.cargo.created', 'Cargo item added'), 'success')
    },
    onError: () => {
      flash(t('frc_offers.detail.cargo.createError', 'Failed to add cargo'), 'error')
    },
  })

  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, field, value }: { lineId: string; field: string; value: unknown }) => {
      const call = await apiCall(`/api/frc_offers/offers/${offerId}/lines/${lineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!call.ok) throw new Error('Failed to update cargo')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_offer', offerId] })
    },
    onError: () => {
      flash(t('frc_offers.detail.cargo.updateError', 'Failed to update cargo'), 'error')
    },
  })

  const deleteLineMutation = useMutation({
    mutationFn: async (lineId: string) => {
      const call = await apiCall(`/api/frc_offers/offers/${offerId}/lines/${lineId}`, {
        method: 'DELETE',
      })
      if (!call.ok) throw new Error('Failed to delete cargo')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_offer', offerId] })
      flash(t('frc_offers.detail.cargo.deleted', 'Cargo item removed'), 'success')
    },
    onError: () => {
      flash(t('frc_offers.detail.cargo.deleteError', 'Failed to remove cargo'), 'error')
    },
  })

  // Handlers
  const handleFieldSave = React.useCallback(async (field: string, value: unknown) => {
    await updateMutation.mutateAsync({ field, value })
  }, [updateMutation])

  const handleRoutingSave = React.useCallback(async (routingId: string, field: string, value: unknown) => {
    await updateRoutingMutation.mutateAsync({ routingId, field, value })
  }, [updateRoutingMutation])

  const handleRoutingCreate = React.useCallback(async (data: Record<string, unknown>): Promise<{ id: string }> => {
    const result = await createRoutingMutation.mutateAsync(data)
    if (!result) throw new Error('Failed to create routing')
    return result
  }, [createRoutingMutation])

  const handleRoutingDelete = React.useCallback(async (routingId: string) => {
    await deleteRoutingMutation.mutateAsync(routingId)
  }, [deleteRoutingMutation])

  const handleDeleteOffer = React.useCallback(async () => {
    await deleteOfferMutation.mutateAsync()
  }, [deleteOfferMutation])

  const handleLineSave = React.useCallback(async (lineId: string, field: string, value: unknown) => {
    await updateLineMutation.mutateAsync({ lineId, field, value })
  }, [updateLineMutation])

  const handleLineCreate = React.useCallback(async (data: Record<string, unknown>): Promise<{ id: string }> => {
    const result = await createLineMutation.mutateAsync(data)
    if (!result) throw new Error('Failed to create cargo')
    return result
  }, [createLineMutation])

  const handleLineDelete = React.useCallback(async (lineId: string) => {
    await deleteLineMutation.mutateAsync(lineId)
  }, [deleteLineMutation])

  const handleCargoDataChange = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['frc_offer', offerId] })
  }, [queryClient, offerId])

  const handleClientChange = React.useCallback(async (carrierId: string | null) => {
    await updateMutation.mutateAsync({ field: 'carrierId', value: carrierId })
  }, [updateMutation])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !offerData) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          {t('frc_offers.detail.notFound', 'Offer not found')}
        </p>
      </div>
    )
  }

  // Calculate total chargeable weight for pricing auto-calculation
  const totalChargeableWeight = offerData.offerLines.reduce((sum, line) => {
    return sum + (parseFloat(line.chargeableWeightKg) || 0)
  }, 0)

  // Prepare data for components
  const detailsData: OfferDetailsData = {
    id: offerData.id,
    name: offerData.name,
    status: offerData.status,
    awbNumber: offerData.awbNumber,
    connectionMethod: offerData.connectionMethod,
    departureDate: offerData.departureDate,
    rfqId: offerData.rfqId,
    rfqName: offerData.rfqName,
    assignedToId: offerData.assignedToId,
    assignedToName: offerData.assignedToName,
  }

  const pricingData: OfferPricingData = {
    connectionRatePerKg: offerData.connectionRatePerKg,
    connectionRateTotal: offerData.connectionRateTotal,
    airfreightRatePerKg: offerData.airfreightRatePerKg,
    airfreightRateTotal: offerData.airfreightRateTotal,
    totalRatePerKg: offerData.totalRatePerKg,
    totalRate: offerData.totalRate,
    currencyCode: offerData.currencyCode,
    chargeableWeight: totalChargeableWeight > 0 ? String(totalChargeableWeight) : null,
  }

  const cargoData: OfferLineData[] = offerData.offerLines.map((line) => ({
    id: line.id,
    name: line.name,
    numberOfPieces: line.numberOfPieces,
    lengthCm: line.lengthCm,
    widthCm: line.widthCm,
    heightCm: line.heightCm,
    volumeM3: line.volumeM3,
    volumetricWeightKg: line.volumetricWeightKg,
    actualWeightKg: line.actualWeightKg,
    chargeableWeightKg: line.chargeableWeightKg,
    stackableType: line.stackableType,
  }))

  const routingData: AirRoutingData[] = offerData.airRouting.map((routing) => ({
    id: routing.id,
    name: routing.name,
    type: routing.type,
    flightNumber: routing.flightNumber,
    originAirport: routing.originAirport,
    destinationAirport: routing.destinationAirport,
    departureDate: routing.departureDate,
    departureTime: routing.departureTime,
    arrivalDate: routing.arrivalDate,
    arrivalTime: routing.arrivalTime,
  }))

  // Prepare data for OfferHighlights
  const highlightsData = {
    id: offerData.id,
    name: offerData.name,
    rfqId: offerData.rfqId,
    rfqName: offerData.rfqName,
    carrierId: offerData.carrierId,
    assignedToId: offerData.assignedToId,
    assignedToName: offerData.assignedToName,
    status: offerData.status,
    awbNumber: offerData.awbNumber,
    connectionMethod: offerData.connectionMethod,
    departureDate: offerData.departureDate,
    currencyCode: offerData.currencyCode,
    totalRate: offerData.totalRate,
    cargoItemsCount: offerData.offerLines.length,
    originAirport: offerData.originAirport,
    destinationAirport: offerData.destinationAirport,
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header with back button, summary info, and actions */}
      <OfferHighlights
        offer={highlightsData}
        onDelete={handleDeleteOffer}
        isDeleting={deleteOfferMutation.isPending}
        onSendWithTemplate={() => setSendDialogOpen(true)}
      />

      {/* Offer Details */}
      <CollapsibleSection
        title={t('frc_offers.detail.sections.details', 'Offer Details')}
        icon={FileText}
        defaultOpen={true}
      >
        <OfferDetailsEditTable
          offerId={offerData.id}
          data={detailsData}
          onFieldSave={handleFieldSave}
          tableRef={detailsTableRef}
          siblingTableRefs={{ next: pricingTableRef }}
        />
      </CollapsibleSection>

      {/* Pricing */}
      <CollapsibleSection
        title={t('frc_offers.detail.sections.pricing', 'Pricing')}
        icon={DollarSign}
        defaultOpen={true}
      >
        <OfferPricingEditTable
          offerId={offerData.id}
          data={pricingData}
          onFieldSave={handleFieldSave}
          tableRef={pricingTableRef}
          siblingTableRefs={{ prev: detailsTableRef, next: cargoTableRef }}
        />
      </CollapsibleSection>

      {/* Cargo */}
      <CollapsibleSection
        title={t('frc_offers.detail.sections.cargo', 'Cargo')}
        icon={Package}
        count={cargoData.length}
        defaultOpen={true}
      >
        <OfferCargoTable
          offerId={offerData.id}
          offerLines={cargoData}
          onLineSave={handleLineSave}
          onLineCreate={handleLineCreate}
          onLineDelete={handleLineDelete}
          onDataChange={handleCargoDataChange}
          tableRef={cargoTableRef}
          siblingTableRefs={{ prev: pricingTableRef, next: clientTableRef }}
        />
      </CollapsibleSection>

      {/* Client */}
      <CollapsibleSection
        title={t('frc_offers.detail.sections.client', 'Client')}
        icon={Building2}
        defaultOpen={true}
      >
        <OfferClientSection
          offerId={offerData.id}
          carrierId={offerData.carrierId}
          onClientChange={handleClientChange}
          tableRef={clientTableRef}
          siblingTableRefs={{ prev: cargoTableRef, next: routingTableRef }}
        />
      </CollapsibleSection>

      {/* Air Routing */}
      <CollapsibleSection
        title={t('frc_offers.detail.sections.routing', 'Air Routing')}
        icon={Route}
        count={routingData.length}
        defaultOpen={true}
      >
        <OfferRoutingEditTable
          offerId={offerData.id}
          routingItems={routingData}
          onRoutingSave={handleRoutingSave}
          onRoutingCreate={handleRoutingCreate}
          onRoutingDelete={handleRoutingDelete}
          tableRef={routingTableRef}
          siblingTableRefs={{ prev: clientTableRef }}
        />
      </CollapsibleSection>

      {/* Send Offer Dialog */}
      <SendOfferDialog
        offer={offerData}
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
      />
    </div>
  )
}
