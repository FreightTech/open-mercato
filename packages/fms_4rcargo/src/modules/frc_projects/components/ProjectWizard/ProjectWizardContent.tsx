'use client'

import * as React from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Link2, Link2Off } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

import { ProjectWizardDetailsTable } from './ProjectWizardDetailsTable'
import { ProjectWizardRouteTable } from './ProjectWizardRouteTable'
import type {
  ProjectDraft,
  RfqOption,
  OfferOption,
  ContractorOption,
} from './types'
import { createEmptyProjectDraft } from './types'

interface ProjectWizardContentProps {
  onCreated?: (projectId: string) => void | Promise<void>
  onCancel?: () => void
}

export function ProjectWizardContent({
  onCreated,
  onCancel,
}: ProjectWizardContentProps) {
  // State
  const [draft, setDraft] = useState<ProjectDraft>(createEmptyProjectDraft)
  const [isSaving, setIsSaving] = useState(false)
  const [linkToSource, setLinkToSource] = useState(false)

  // Table refs for cross-table navigation
  const detailsTableRef = useRef<HTMLDivElement>(null!)
  const routeTableRef = useRef<HTMLDivElement>(null!)

  // Fetch opportunities (RFQs) for source selection
  const { data: rfqsData } = useQuery({
    queryKey: ['frc_rfqs_options'],
    queryFn: async () => {
      const call = await apiCall<{ items: RfqOption[] }>(
        '/api/frc_rfqs/rfqs?limit=100&sortField=createdAt&sortDir=desc'
      )
      if (!call.ok) return { items: [] }
      return call.result ?? { items: [] }
    },
    enabled: linkToSource,
  })

  // Fetch offers for selected RFQ
  const { data: offersData } = useQuery({
    queryKey: ['frc_offers_for_rfq', draft.rfqId],
    queryFn: async () => {
      if (!draft.rfqId) return { items: [] }
      const call = await apiCall<{ items: OfferOption[] }>(
        `/api/frc_offers/offers?rfqId=${draft.rfqId}&limit=50`
      )
      if (!call.ok) return { items: [] }
      return call.result ?? { items: [] }
    },
    enabled: linkToSource && !!draft.rfqId,
  })

  // Fetch contractors (accounts)
  const { data: contractorsData } = useQuery({
    queryKey: ['contractors_options'],
    queryFn: async () => {
      const call = await apiCall<{ items: ContractorOption[] }>(
        '/api/frc_contractors/contractors?limit=200'
      )
      if (!call.ok) return { items: [] }
      return call.result ?? { items: [] }
    },
  })

  // Auto-populate from selected RFQ
  useEffect(() => {
    if (!draft.rfqId || !rfqsData?.items) return
    const selectedRfq = rfqsData.items.find((r) => r.id === draft.rfqId)
    if (selectedRfq) {
      setDraft((prev) => ({
        ...prev,
        accountId: selectedRfq.accountId ?? prev.accountId,
        originAirportId: selectedRfq.originAirportId ?? prev.originAirportId,
        originAirportCode: selectedRfq.originAirport?.code ?? prev.originAirportCode,
        destinationAirportId: selectedRfq.destinationAirportId ?? prev.destinationAirportId,
        destinationAirportCode: selectedRfq.destinationAirport?.code ?? prev.destinationAirportCode,
        shipmentReadyDate: selectedRfq.shipmentReadyDate ?? prev.shipmentReadyDate,
        requiredDeliveryDate: selectedRfq.requiredAtDestinationDate ?? prev.requiredDeliveryDate,
        totalValue: selectedRfq.amount ?? prev.totalValue,
        currencyCode: selectedRfq.currencyCode ?? prev.currencyCode,
      }))
    }
  }, [draft.rfqId, rfqsData?.items])

  // Auto-populate from selected Offer
  useEffect(() => {
    if (!draft.offerId || !offersData?.items) return
    const selectedOffer = offersData.items.find((o) => o.id === draft.offerId)
    if (selectedOffer) {
      setDraft((prev) => ({
        ...prev,
        totalValue: selectedOffer.totalRate ?? prev.totalValue,
        currencyCode: selectedOffer.currencyCode ?? prev.currencyCode,
      }))
    }
  }, [draft.offerId, offersData?.items])

  const handleDraftChange = useCallback((updates: Partial<ProjectDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }))
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)

    try {
      const payload: Record<string, unknown> = {
        rfqId: draft.rfqId,
        offerId: draft.offerId,
        accountId: draft.accountId,
        status: draft.status,
        totalValue: draft.totalValue,
        currencyCode: draft.currencyCode,
        originAirportId: draft.originAirportId,
        destinationAirportId: draft.destinationAirportId,
        shipmentReadyDate: draft.shipmentReadyDate,
        requiredDeliveryDate: draft.requiredDeliveryDate,
        notes: draft.notes,
      }

      const response = await apiCall<{ id: string; projectNumber: string; error?: string }>(
        '/api/frc_projects/projects',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok || !response.result?.id) {
        const error = response.result?.error || 'Failed to create project'
        throw new Error(error)
      }

      flash(`Project ${response.result.projectNumber} created successfully`, 'success')
      await onCreated?.(response.result.id)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project'
      flash(errorMessage, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [draft, onCreated])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Cmd+Enter or Ctrl+Enter to save
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSave()
      }
    },
    [handleSave]
  )

  const selectedRfq = rfqsData?.items.find((r) => r.id === draft.rfqId)

  return (
    <div className="p-6 space-y-4" onKeyDown={handleKeyDown}>
      {/* Source Section (Optional) */}
      <div className="border rounded-lg">
        <div className="px-3 py-1.5 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            {linkToSource ? (
              <Link2 className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Link2Off className="h-4 w-4 text-muted-foreground" />
            )}
            <h3 className="text-sm font-medium">Link to Opportunity</h3>
            <span className="text-xs text-muted-foreground">(optional)</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setLinkToSource(!linkToSource)
              if (linkToSource) {
                // Clear source when disabling
                setDraft((prev) => ({ ...prev, rfqId: null, offerId: null }))
              }
            }}
          >
            {linkToSource ? 'Unlink' : 'Link'}
          </Button>
        </div>
        {linkToSource && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rfq">Opportunity (RFQ)</Label>
                <select
                  id="rfq"
                  value={draft.rfqId ?? ''}
                  onChange={(e) => {
                    handleDraftChange({ rfqId: e.target.value || null, offerId: null })
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select opportunity...</option>
                  {rfqsData?.items.map((rfq) => (
                    <option key={rfq.id} value={rfq.id}>
                      {rfq.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="offer">Offer</Label>
                <select
                  id="offer"
                  value={draft.offerId ?? ''}
                  onChange={(e) => handleDraftChange({ offerId: e.target.value || null })}
                  disabled={!draft.rfqId}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  <option value="">Select offer...</option>
                  {offersData?.items.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name} {offer.awbNumber ? `(AWB: ${offer.awbNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedRfq && (
              <div className="p-3 bg-muted rounded-md text-sm">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <span className="text-muted-foreground">Route</span>
                    <p className="font-mono">
                      {selectedRfq.originAirport?.code ?? '?'} - {selectedRfq.destinationAirport?.code ?? '?'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ready</span>
                    <p>{selectedRfq.shipmentReadyDate?.split('T')[0] ?? '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Required</span>
                    <p>{selectedRfq.requiredAtDestinationDate?.split('T')[0] ?? '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount</span>
                    <p>{selectedRfq.amount ? `${selectedRfq.amount} ${selectedRfq.currencyCode}` : '-'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details Section */}
      <div ref={detailsTableRef}>
        <ProjectWizardDetailsTable
          draft={draft}
          onDraftChange={handleDraftChange}
          contractors={contractorsData?.items ?? []}
          nextTableRef={routeTableRef}
        />
      </div>

      {/* Route Section */}
      <div ref={routeTableRef}>
        <ProjectWizardRouteTable
          draft={draft}
          onDraftChange={handleDraftChange}
          prevTableRef={detailsTableRef}
        />
      </div>

      {/* Notes Section */}
      <div className="border rounded-lg">
        <div className="px-3 py-1.5 border-b">
          <h3 className="text-sm font-medium">Notes</h3>
        </div>
        <div className="p-3">
          <textarea
            className="w-full h-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            placeholder="Additional notes or description..."
            value={draft.notes ?? ''}
            onChange={(e) => handleDraftChange({ notes: e.target.value || null })}
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Create Project
        </Button>
      </div>

      {/* Keyboard hint */}
      <div className="text-xs text-muted-foreground text-center">
        Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Cmd+Enter</kbd> to save
      </div>
    </div>
  )
}
