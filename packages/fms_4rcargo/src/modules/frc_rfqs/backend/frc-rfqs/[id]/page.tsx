'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Package, FileText, Plus, Route, ClipboardList } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { RfqHighlights } from '../../../components/RfqHighlights'
import { CargoSummaryCard } from '../../../components/CargoSummaryCard'
import { OpportunityDetailsEditTable } from '../../../components/OpportunityDetailsEditTable'
import { AirRoutingEditTable } from '../../../components/AirRoutingEditTable'
import { AirCargoEditTable, type AirCargoEditItem } from '../../../components/AirCargoEditTable'
import { LinkedOffersTable, type LinkedOffer } from '../../../components/LinkedOffersTable'
// Import CollapsibleSection from frc_offers module (shared component)
import { CollapsibleSection } from '../../../../frc_offers/components/CollapsibleSection'

type RfqDetailData = {
  id: string
  name: string
  accountId: string | null
  contactId: string | null
  salesStage: string
  probability: number
  amount: string | null
  currencyCode: string
  deliveryStatus: string
  isDelayed: boolean
  originType: string
  originAirport: { id: string; code: string; longCode: string } | null
  destinationAirport: { id: string; code: string; longCode: string } | null
  shipmentReadyDate: string | null
  requiredAtDestinationDate: string | null
  looseOrUnitised: string | null
  targetRate: string | null
  product: string | null
  commodity: string | null
  totalPieces: number
  totalVolume: string
  totalActualWeight: string
  totalChargeableWeight: string
  totalLoadingMetres: string
  description: string | null
  assignedToId: string | null
  requestDate: string
  organizationId: string
  tenantId: string
  createdAt: string
  updatedAt: string
  airCargo: AirCargoEditItem[]
  offers: LinkedOffer[]
}

type DetailPageProps = {
  params?: { id?: string }
}

export default function RfqDetailPage({ params: propsParams }: DetailPageProps) {
  const t = useT()
  const router = useRouter()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const queryClient = useQueryClient()

  const [isDeleting, setIsDeleting] = React.useState(false)
  const [isCreatingOffer, setIsCreatingOffer] = React.useState(false)

  // Table refs for cross-table navigation
  const detailsTableRef = React.useRef<HTMLDivElement>(null)
  const routingTableRef = React.useRef<HTMLDivElement>(null)
  const cargoTableRef = React.useRef<HTMLDivElement>(null)
  const offersTableRef = React.useRef<HTMLDivElement>(null)

  // Get rfqId from props params (passed by catch-all route) or fallback to useParams
  const rfqId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  // Fetch RFQ details
  const { data: rfqData, isLoading, error } = useQuery({
    queryKey: ['frc_rfq', rfqId],
    queryFn: async () => {
      const call = await apiCall<RfqDetailData>(`/api/frc_rfqs/rfqs/${rfqId}`)
      if (!call.ok) throw new Error('Failed to load RFQ')
      return call.result
    },
    enabled: !!rfqId,
  })

  // Update RFQ field mutation
  const updateMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: unknown }) => {
      const call = await apiCall(`/api/frc_rfqs/rfqs/${rfqId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!call.ok) throw new Error('Failed to update RFQ')
      return call.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frc_rfq', rfqId] })
      flash(t('frc_rfqs.detail.updateSuccess', 'Updated successfully'), 'success')
    },
    onError: () => {
      flash(t('frc_rfqs.detail.updateError', 'Failed to update'), 'error')
    },
  })

  const handleFieldSave = React.useCallback(async (field: string, value: unknown) => {
    await updateMutation.mutateAsync({ field, value })
  }, [updateMutation])

  const handleDelete = React.useCallback(async () => {
    setIsDeleting(true)
    try {
      const call = await apiCall(`/api/frc_rfqs/rfqs/${rfqId}`, { method: 'DELETE' })
      if (!call.ok) throw new Error('Failed to delete')
      flash(t('frc_rfqs.detail.deleteSuccess', 'Opportunity deleted'), 'success')
      router.push('/backend/frc-rfqs')
    } catch {
      flash(t('frc_rfqs.detail.deleteError', 'Failed to delete'), 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [rfqId, router, t])

  // Create a new offer from this RFQ with auto-populated data
  const handleCreateOffer = React.useCallback(async () => {
    if (!rfqData || isCreatingOffer) return

    setIsCreatingOffer(true)
    try {
      const offerName = rfqData.name
      const response = await apiCall<{ id: string; name: string; error?: string }>('/api/frc_offers/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId: rfqData.id,
          name: offerName,
          status: 'draft',
        }),
      })

      if (!response.ok || !response.result?.id) {
        throw new Error(response.result?.error ?? 'Failed to create offer')
      }

      flash(t('frc_rfqs.detail.offerCreated', 'Offer created successfully'), 'success')
      // Redirect to the newly created offer detail page
      router.push(`/backend/frc-offers/${response.result.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create offer'
      flash(message, 'error')
    } finally {
      setIsCreatingOffer(false)
    }
  }, [rfqData, isCreatingOffer, router, t])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !rfqData) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          {t('frc_rfqs.detail.notFound', 'Opportunity not found')}
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header Highlights */}
      <RfqHighlights
        rfq={rfqData}
        onFieldSave={handleFieldSave}
        onDelete={handleDelete}
        isDeleting={isDeleting}
      />

      {/* Cargo Summary Card */}
      <CargoSummaryCard
        data={{
          totalPieces: rfqData.totalPieces,
          totalVolume: rfqData.totalVolume,
          totalActualWeight: rfqData.totalActualWeight,
          totalChargeableWeight: rfqData.totalChargeableWeight,
          totalLoadingMetres: rfqData.totalLoadingMetres,
          product: rfqData.product,
          commodity: rfqData.commodity,
          looseOrUnitised: rfqData.looseOrUnitised,
        }}
      />

      {/* Opportunity Details */}
      <CollapsibleSection
        title={t('frc_rfqs.detail.opportunityDetails', 'Opportunity Details')}
        icon={ClipboardList}
        defaultOpen={true}
      >
        <OpportunityDetailsEditTable
          rfqId={rfqId!}
          data={{
            id: rfqData.id,
            name: rfqData.name,
            product: rfqData.product,
            commodity: rfqData.commodity,
            salesStage: rfqData.salesStage,
            probability: rfqData.probability,
            currencyCode: rfqData.currencyCode,
            amount: rfqData.amount,
          }}
          onFieldSave={handleFieldSave}
          tableRef={detailsTableRef}
          siblingTableRefs={{ next: routingTableRef }}
        />
      </CollapsibleSection>

      {/* Air Routing */}
      <CollapsibleSection
        title={t('frc_rfqs.detail.airRouting', 'Air Routing')}
        icon={Route}
        defaultOpen={true}
      >
        <AirRoutingEditTable
          rfqId={rfqId!}
          data={{
            id: rfqData.id,
            originAirport: rfqData.originAirport,
            destinationAirport: rfqData.destinationAirport,
            shipmentReadyDate: rfqData.shipmentReadyDate,
            requiredAtDestinationDate: rfqData.requiredAtDestinationDate,
            looseOrUnitised: rfqData.looseOrUnitised,
            targetRate: rfqData.targetRate,
          }}
          onFieldSave={handleFieldSave}
          tableRef={routingTableRef}
          siblingTableRefs={{ prev: detailsTableRef, next: cargoTableRef }}
        />
      </CollapsibleSection>

      {/* Air Cargo Lines */}
      <CollapsibleSection
        title={t('frc_rfqs.detail.cargoLines', 'Air Cargo Lines')}
        icon={Package}
        count={rfqData.airCargo.length}
        defaultOpen={true}
      >
        <AirCargoEditTable
          rfqId={rfqId!}
          cargoItems={rfqData.airCargo}
          isLoading={false}
          onDataChange={() => queryClient.invalidateQueries({ queryKey: ['frc_rfq', rfqId] })}
          tableRef={cargoTableRef}
          siblingTableRefs={{ prev: routingTableRef, next: offersTableRef }}
        />
      </CollapsibleSection>

      {/* Linked Offers */}
      <CollapsibleSection
        title={t('frc_rfqs.detail.linkedOffers', 'Linked Offers')}
        icon={FileText}
        count={rfqData.offers.length}
        defaultOpen={true}
        actions={
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleCreateOffer}
            disabled={isCreatingOffer}
          >
            {isCreatingOffer ? (
              <Spinner size="sm" className="mr-1" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            {isCreatingOffer
              ? t('frc_rfqs.detail.creatingOffer', 'Creating...')
              : t('frc_rfqs.detail.createOffer', 'Create Offer')}
          </Button>
        }
      >
        <LinkedOffersTable
          offers={rfqData.offers}
          tableRef={offersTableRef}
          siblingTableRefs={{ prev: cargoTableRef }}
        />
      </CollapsibleSection>

    </div>
  )
}
