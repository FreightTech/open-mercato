'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Route } from 'lucide-react'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { OfferHighlights } from '../../../components/OfferHighlights'
import { PricingCard } from '../../../components/PricingCard'
import { AirRoutingTable, type AirRoutingItem } from '../../../components/AirRoutingTable'
import { CollapsibleSection } from '../../../components/CollapsibleSection'

type OfferDetailData = {
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
  organizationId: string
  tenantId: string
  createdAt: string
  updatedAt: string
  airRouting: AirRoutingItem[]
}

type DetailPageProps = {
  params?: { id?: string }
}

export default function OfferDetailPage({ params: propsParams }: DetailPageProps) {
  const t = useT()
  const router = useRouter()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()
  const queryClient = useQueryClient()

  const [isDeleting, setIsDeleting] = React.useState(false)

  // Get offerId from props params (passed by catch-all route) or fallback to useParams
  const offerId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)

  // Fetch Offer details
  const { data: offerData, isLoading, error } = useQuery({
    queryKey: ['frc_offer', offerId],
    queryFn: async () => {
      const call = await apiCall<OfferDetailData>(`/api/frc_offers/offers/${offerId}`)
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
      flash(t('frc_offers.detail.updateSuccess', 'Updated successfully'), 'success')
    },
    onError: () => {
      flash(t('frc_offers.detail.updateError', 'Failed to update'), 'error')
    },
  })

  const handleFieldSave = React.useCallback(async (field: string, value: unknown) => {
    await updateMutation.mutateAsync({ field, value })
  }, [updateMutation])

  const handleDelete = React.useCallback(async () => {
    setIsDeleting(true)
    try {
      const call = await apiCall(`/api/frc_offers/offers/${offerId}`, { method: 'DELETE' })
      if (!call.ok) throw new Error('Failed to delete')
      flash(t('frc_offers.detail.deleteSuccess', 'Offer deleted'), 'success')
      router.push('/backend/frc-offers')
    } catch {
      flash(t('frc_offers.detail.deleteError', 'Failed to delete'), 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [offerId, router, t])

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

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header Highlights */}
      <OfferHighlights
        offer={offerData}
        onFieldSave={handleFieldSave}
        onDelete={handleDelete}
        isDeleting={isDeleting}
      />

      {/* Pricing Card */}
      <PricingCard
        data={{
          connectionRatePerKg: offerData.connectionRatePerKg,
          connectionRateTotal: offerData.connectionRateTotal,
          airfreightRatePerKg: offerData.airfreightRatePerKg,
          airfreightRateTotal: offerData.airfreightRateTotal,
          totalRatePerKg: offerData.totalRatePerKg,
          totalRate: offerData.totalRate,
          currencyCode: offerData.currencyCode,
        }}
      />

      {/* Air Routing Legs */}
      <CollapsibleSection
        title={t('frc_offers.detail.routing.title', 'Air Routing')}
        icon={Route}
        count={offerData.airRouting.length}
        defaultOpen={true}
      >
        <AirRoutingTable items={offerData.airRouting} />
      </CollapsibleSection>
    </div>
  )
}
