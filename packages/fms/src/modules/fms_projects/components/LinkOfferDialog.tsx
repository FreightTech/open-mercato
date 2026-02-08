'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Loader2, Link2 } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { cn } from '@open-mercato/shared/lib/utils'

type OfferSearchResult = {
  id: string
  offerNumber: string
  rfqTitle: string | null
  clientName: string | null
  status: string
  totalAmount: string | null
  currencyCode: string
  createdAt: string
}

type LinkOfferDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onOfferLinked: (offerId: string) => void
}

function formatCurrency(value: string | null, currency: string): string {
  if (!value) return '-'
  const num = parseFloat(value) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function LinkOfferDialog({
  open,
  onOpenChange,
  projectId,
  onOfferLinked,
}: LinkOfferDialogProps) {
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)

  // Reset selection when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setSelectedOfferId(null)
    }
  }, [open])

  // Search for all offers
  const { data, isLoading, error } = useQuery({
    queryKey: ['linkable-offers'],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(
        '/api/fms_offers/offers?limit=50'
      )
      if (!response.ok) throw new Error('Failed to search offers')

      return (response.result?.items || []).map((offer: any) => ({
        id: offer.id,
        offerNumber: offer.offer_number || offer.offerNumber,
        rfqTitle: offer.rfq?.title || offer.rfq?.rfqTitle || offer.rfqTitle,
        clientName: offer.rfq?.client?.name || offer.clientName,
        status: offer.status,
        totalAmount: offer.total_amount || offer.totalAmount,
        currencyCode: offer.currency_code || offer.currencyCode || 'USD',
        createdAt: offer.created_at || offer.createdAt,
      })) as OfferSearchResult[]
    },
    enabled: open,
  })

  const offers = data ?? []
  const selectedOffer = offers.find(o => o.id === selectedOfferId) || null

  // Link offer mutation
  const linkOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/link-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId }),
      })
      if (!response.ok) {
        const errorMsg = (response.result as any)?.error || 'Failed to link offer'
        throw new Error(errorMsg)
      }
      return response.result
    },
    onSuccess: (_, offerId) => {
      flash('Offer linked successfully', 'success')
      onOfferLinked(offerId)
      onOpenChange(false)
    },
    onError: (err) => {
      flash(err instanceof Error ? err.message : 'Failed to link offer', 'error')
    },
  })

  const handleLinkOffer = useCallback(() => {
    if (selectedOfferId) {
      linkOfferMutation.mutate(selectedOfferId)
    }
  }, [selectedOfferId, linkOfferMutation])

  const isLinking = linkOfferMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link Offer to Project</DialogTitle>
          <DialogDescription>
            Select an offer to link to this project. Offer lines will be imported as project lines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Results list */}
          <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-48 text-red-600">
                Failed to load offers
              </div>
            ) : offers.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                No offers available to link
              </div>
            ) : (
              <div className="divide-y">
                {offers.map((offer) => (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => setSelectedOfferId(offer.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors',
                      selectedOfferId === offer.id && 'bg-muted'
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{offer.offerNumber}</span>
                          <Badge
                            variant={offer.status === 'accepted' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {offer.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {offer.rfqTitle && <span>{offer.rfqTitle} · </span>}
                          {offer.clientName || 'No client'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-medium">
                          {formatCurrency(offer.totalAmount, offer.currencyCode)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(offer.createdAt)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLinking}>
              Cancel
            </Button>
            <Button onClick={handleLinkOffer} disabled={!selectedOfferId || isLinking}>
              {isLinking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Link Offer
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
