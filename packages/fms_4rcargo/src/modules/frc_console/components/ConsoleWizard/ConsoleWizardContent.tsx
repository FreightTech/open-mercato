'use client'

import * as React from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Link2, Link2Off } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

import { ConsoleWizardDetailsTable } from './ConsoleWizardDetailsTable'
import { ConsoleWizardRouteTable } from './ConsoleWizardRouteTable'
import type {
  ConsoleDraft,
  ProjectOption,
  RfqOption,
  OfferOption,
  AirRoutingOption,
  TruckPresetOption,
} from './types'
import { createEmptyConsoleDraft } from './types'

interface ConsoleWizardContentProps {
  onCreated?: (consoleId: string) => void | Promise<void>
  onCancel?: () => void
}

interface OfferDetailResponse {
  id: string
  name: string
  rfqId: string | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  airRouting: Array<{
    id: string
    name: string
    originAirport: { id: string; code: string; city: string | null } | null
    destinationAirport: { id: string; code: string; city: string | null } | null
  }>
}

export function ConsoleWizardContent({
  onCreated,
  onCancel,
}: ConsoleWizardContentProps) {
  // State
  const [draft, setDraft] = useState<ConsoleDraft>(createEmptyConsoleDraft)
  const [isSaving, setIsSaving] = useState(false)
  const [linkToSource, setLinkToSource] = useState(false)
  const [sourceType, setSourceType] = useState<'project' | 'rfq'>('project')

  // Table refs for cross-table navigation
  const detailsTableRef = useRef<HTMLDivElement>(null!)
  const routeTableRef = useRef<HTMLDivElement>(null!)

  // Fetch truck presets
  const { data: presetsData } = useQuery({
    queryKey: ['frc_truck_presets_options'],
    queryFn: async () => {
      const call = await apiCall<{ items: TruckPresetOption[] }>(
        '/api/frc_trucks/presets?limit=100'
      )
      if (!call.ok) return { items: [] }
      return call.result ?? { items: [] }
    },
  })

  // Fetch projects for source selection
  const { data: projectsData } = useQuery({
    queryKey: ['frc_projects_options'],
    queryFn: async () => {
      const call = await apiCall<{ items: ProjectOption[] }>(
        '/api/frc_projects/projects?limit=100&sortField=createdAt&sortDir=desc'
      )
      if (!call.ok) return { items: [] }
      return call.result ?? { items: [] }
    },
    enabled: linkToSource && sourceType === 'project',
  })

  // Fetch RFQs for source selection
  const { data: rfqsData } = useQuery({
    queryKey: ['frc_rfqs_options'],
    queryFn: async () => {
      const call = await apiCall<{ items: RfqOption[] }>(
        '/api/frc_rfqs/rfqs?limit=100&sortField=createdAt&sortDir=desc'
      )
      if (!call.ok) return { items: [] }
      return call.result ?? { items: [] }
    },
    enabled: linkToSource && sourceType === 'rfq',
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
    enabled: linkToSource && sourceType === 'rfq' && !!draft.rfqId,
  })

  // Fetch offer details (for air routing) when offer is selected
  const { data: offerDetailData } = useQuery({
    queryKey: ['frc_offer_detail', draft.offerId],
    queryFn: async () => {
      if (!draft.offerId) return null
      const call = await apiCall<OfferDetailResponse>(
        `/api/frc_offers/offers/${draft.offerId}`
      )
      if (!call.ok) return null
      return call.result ?? null
    },
    enabled: linkToSource && sourceType === 'rfq' && !!draft.offerId,
  })

  // Auto-populate from selected Project
  useEffect(() => {
    if (!draft.projectId || !projectsData?.items) return
    const selectedProject = projectsData.items.find((p) => p.id === draft.projectId)
    if (selectedProject) {
      setDraft((prev) => ({
        ...prev,
        originAirportId: selectedProject.originAirportId ?? prev.originAirportId,
        originAirportCode: selectedProject.originAirport?.code ?? prev.originAirportCode,
        destinationAirportId: selectedProject.destinationAirportId ?? prev.destinationAirportId,
        destinationAirportCode: selectedProject.destinationAirport?.code ?? prev.destinationAirportCode,
      }))
    }
  }, [draft.projectId, projectsData?.items])

  // Auto-populate from selected RFQ
  useEffect(() => {
    if (!draft.rfqId || !rfqsData?.items) return
    const selectedRfq = rfqsData.items.find((r) => r.id === draft.rfqId)
    if (selectedRfq) {
      setDraft((prev) => ({
        ...prev,
        originAirportId: selectedRfq.originAirportId ?? prev.originAirportId,
        originAirportCode: selectedRfq.originAirport?.code ?? prev.originAirportCode,
        destinationAirportId: selectedRfq.destinationAirportId ?? prev.destinationAirportId,
        destinationAirportCode: selectedRfq.destinationAirport?.code ?? prev.destinationAirportCode,
      }))
    }
  }, [draft.rfqId, rfqsData?.items])

  // Auto-populate from selected Offer (uses offer's route from RFQ)
  useEffect(() => {
    if (!draft.offerId || !offerDetailData) return
    // Use offer's airport info (from RFQ) unless air routing overrides it
    if (offerDetailData.originAirport || offerDetailData.destinationAirport) {
      setDraft((prev) => ({
        ...prev,
        originAirportId: offerDetailData.originAirport?.id ?? prev.originAirportId,
        originAirportCode: offerDetailData.originAirport?.code ?? prev.originAirportCode,
        destinationAirportId: offerDetailData.destinationAirport?.id ?? prev.destinationAirportId,
        destinationAirportCode: offerDetailData.destinationAirport?.code ?? prev.destinationAirportCode,
      }))
    }
  }, [draft.offerId, offerDetailData])

  // Auto-populate from selected Air Routing
  useEffect(() => {
    if (!draft.airRoutingId || !offerDetailData?.airRouting) return
    const selectedRouting = offerDetailData.airRouting.find((r) => r.id === draft.airRoutingId)
    if (selectedRouting) {
      setDraft((prev) => ({
        ...prev,
        originAirportId: selectedRouting.originAirport?.id ?? prev.originAirportId,
        originAirportCode: selectedRouting.originAirport?.code ?? prev.originAirportCode,
        destinationAirportId: selectedRouting.destinationAirport?.id ?? prev.destinationAirportId,
        destinationAirportCode: selectedRouting.destinationAirport?.code ?? prev.destinationAirportCode,
      }))
    }
  }, [draft.airRoutingId, offerDetailData?.airRouting])

  const handleDraftChange = useCallback((updates: Partial<ConsoleDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }))
  }, [])

  const handleSave = useCallback(async () => {
    // Validation
    if (!draft.truckId) {
      flash('Please select a truck', 'error')
      return
    }

    setIsSaving(true)

    try {
      const payload: Record<string, unknown> = {
        date: draft.date,
        truckId: draft.truckId,
        truckPresetId: draft.truckPresetId,
        status: draft.status,
        originAirportId: draft.originAirportId,
        destinationAirportId: draft.destinationAirportId,
        projectId: draft.projectId,
        airRoutingId: draft.airRoutingId,
        notes: draft.notes,
      }

      const response = await apiCall<{ id: string; name: string; error?: string }>(
        '/api/frc_console/console',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok || !response.result?.id) {
        const error = response.result?.error || 'Failed to create console'
        throw new Error(error)
      }

      flash(`Console "${response.result.name}" created successfully`, 'success')
      await onCreated?.(response.result.id)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create console'
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

  const clearSourceLinks = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      projectId: null,
      rfqId: null,
      offerId: null,
      airRoutingId: null,
    }))
  }, [])

  const selectedProject = projectsData?.items.find((p) => p.id === draft.projectId)
  const selectedRfq = rfqsData?.items.find((r) => r.id === draft.rfqId)
  const airRoutings: AirRoutingOption[] = offerDetailData?.airRouting ?? []

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
            <h3 className="text-sm font-medium">Link to Source</h3>
            <span className="text-xs text-muted-foreground">(optional)</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setLinkToSource(!linkToSource)
              if (linkToSource) {
                clearSourceLinks()
              }
            }}
          >
            {linkToSource ? 'Unlink' : 'Link'}
          </Button>
        </div>
        {linkToSource && (
          <div className="p-4 space-y-4">
            {/* Source Type Selection */}
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sourceType"
                  checked={sourceType === 'project'}
                  onChange={() => {
                    setSourceType('project')
                    clearSourceLinks()
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Link to Project</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sourceType"
                  checked={sourceType === 'rfq'}
                  onChange={() => {
                    setSourceType('rfq')
                    clearSourceLinks()
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Link to RFQ/Offer</span>
              </label>
            </div>

            {sourceType === 'project' && (
              <div className="space-y-2">
                <Label htmlFor="project">Project</Label>
                <select
                  id="project"
                  value={draft.projectId ?? ''}
                  onChange={(e) => {
                    handleDraftChange({ projectId: e.target.value || null })
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select project...</option>
                  {projectsData?.items.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.projectNumber}
                    </option>
                  ))}
                </select>

                {selectedProject && (
                  <div className="p-3 bg-muted rounded-md text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground">Route</span>
                        <p className="font-mono">
                          {selectedProject.originAirport?.code ?? '?'} -{' '}
                          {selectedProject.destinationAirport?.code ?? '?'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Dates</span>
                        <p>
                          {selectedProject.shipmentReadyDate?.split('T')[0] ?? '-'} /{' '}
                          {selectedProject.requiredDeliveryDate?.split('T')[0] ?? '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sourceType === 'rfq' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rfq">Opportunity (RFQ)</Label>
                    <select
                      id="rfq"
                      value={draft.rfqId ?? ''}
                      onChange={(e) => {
                        handleDraftChange({
                          rfqId: e.target.value || null,
                          offerId: null,
                          airRoutingId: null,
                        })
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select RFQ...</option>
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
                      onChange={(e) => {
                        handleDraftChange({
                          offerId: e.target.value || null,
                          airRoutingId: null,
                        })
                      }}
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

                {/* Air Routing selection (when offer has multiple routings) */}
                {airRoutings.length > 1 && (
                  <div className="space-y-2">
                    <Label htmlFor="airRouting">Air Routing</Label>
                    <select
                      id="airRouting"
                      value={draft.airRoutingId ?? ''}
                      onChange={(e) => {
                        handleDraftChange({ airRoutingId: e.target.value || null })
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select routing leg...</option>
                      {airRoutings.map((routing) => (
                        <option key={routing.id} value={routing.id}>
                          {routing.name} ({routing.originAirport?.code ?? '?'} -{' '}
                          {routing.destinationAirport?.code ?? '?'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedRfq && (
                  <div className="p-3 bg-muted rounded-md text-sm">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <span className="text-muted-foreground">Route</span>
                        <p className="font-mono">
                          {selectedRfq.originAirport?.code ?? '?'} -{' '}
                          {selectedRfq.destinationAirport?.code ?? '?'}
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
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details Section */}
      <div ref={detailsTableRef}>
        <ConsoleWizardDetailsTable
          draft={draft}
          onDraftChange={handleDraftChange}
          truckPresets={presetsData?.items ?? []}
          nextTableRef={routeTableRef}
        />
      </div>

      {/* Route Section */}
      <div ref={routeTableRef}>
        <ConsoleWizardRouteTable
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
            className="w-full h-24 px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none bg-transparent"
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
          Create Console
        </Button>
      </div>

      {/* Keyboard hint */}
      <div className="text-xs text-muted-foreground text-center">
        Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Cmd+Enter</kbd> to save
      </div>
    </div>
  )
}
