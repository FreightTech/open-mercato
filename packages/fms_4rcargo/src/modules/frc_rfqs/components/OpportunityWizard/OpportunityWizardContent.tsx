'use client'

import * as React from 'react'
import { useState, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

import { OpportunityDetailsTable } from './OpportunityDetailsTable'
import { OpportunityRouteTable } from './OpportunityRouteTable'
import { OpportunityCargoTable } from './OpportunityCargoTable'
import type { OpportunityDraft, CargoItemDraft } from './types'
import { createEmptyOpportunityDraft, calculateCargoMetrics } from './types'

interface OpportunityWizardContentProps {
  onCreated?: (opportunityId: string) => void | Promise<void>
  onCancel?: () => void
}

export function OpportunityWizardContent({
  onCreated,
  onCancel,
}: OpportunityWizardContentProps) {
  // State
  const [draft, setDraft] = useState<OpportunityDraft>(createEmptyOpportunityDraft)
  const [cargoItems, setCargoItems] = useState<CargoItemDraft[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Table refs for cross-table navigation
  const detailsTableRef = useRef<HTMLDivElement>(null!)
  const routeTableRef = useRef<HTMLDivElement>(null!)
  const cargoTableRef = useRef<HTMLDivElement>(null!)

  const handleDraftChange = useCallback((updates: Partial<OpportunityDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }))
  }, [])

  const handleCargoItemsChange = useCallback((items: CargoItemDraft[]) => {
    setCargoItems(items)
  }, [])

  const validate = useCallback((): string | null => {
    if (!draft.name.trim()) {
      return 'Opportunity name is required'
    }
    return null
  }, [draft])

  const handleSave = useCallback(async () => {
    const validationError = validate()
    if (validationError) {
      flash(validationError, 'error')
      return
    }

    setIsSaving(true)

    try {
      // Step 1: Create the RFQ
      const rfqPayload: Record<string, unknown> = {
        name: draft.name.trim(),
        product: draft.product,
        commodity: draft.commodity,
        salesStage: draft.salesStage,
        probability: draft.probability,
        currencyCode: draft.currencyCode,
        amount: draft.amount,
        originAirportId: draft.originAirportId,
        destinationAirportId: draft.destinationAirportId,
        shipmentReadyDate: draft.shipmentReadyDate,
        requiredAtDestinationDate: draft.requiredAtDestinationDate,
        looseOrUnitised: draft.looseOrUnitised,
        targetRate: draft.targetRate,
        description: draft.description,
      }

      const rfqResponse = await apiCall<{ id: string; error?: string }>(
        '/api/frc_rfqs/rfqs',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rfqPayload),
        }
      )

      if (!rfqResponse.ok || !rfqResponse.result?.id) {
        const error = rfqResponse.result?.error || 'Failed to create opportunity'
        throw new Error(error)
      }

      const rfqId = rfqResponse.result.id

      // Step 2: Add cargo items (if any)
      if (cargoItems.length > 0) {
        const cargoPayload = cargoItems.map((item) => {
          const metrics = calculateCargoMetrics(item)
          return {
            name: item.name || draft.name,
            numberOfPieces: item.numberOfPieces,
            stackableType: item.stackableType,
            lengthCm: item.lengthCm,
            widthCm: item.widthCm,
            heightCm: item.heightCm,
            actualWeightKg: item.actualWeightKg,
            volumeM3: metrics.volumeM3,
            volumetricWeightKg: metrics.volumetricWeightKg,
            chargeableWeightKg: metrics.chargeableWeightKg,
            loadingMetres: metrics.loadingMetres,
          }
        })

        const cargoResponse = await apiCall<{ success?: boolean; error?: string }>(
          `/api/frc_rfqs/rfqs/${rfqId}/cargo`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cargoPayload }),
          }
        )

        if (!cargoResponse.ok) {
          // Log warning but don't fail - RFQ is already created
          console.warn('Failed to add cargo items:', cargoResponse.result?.error)
          flash('Opportunity created, but some cargo items could not be added', 'warning')
        }
      }

      flash('Opportunity created successfully', 'success')
      await onCreated?.(rfqId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create opportunity'
      flash(errorMessage, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [draft, cargoItems, validate, onCreated])

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

  return (
    <div className="p-6 space-y-4" onKeyDown={handleKeyDown}>
      {/* Details Section */}
      <div ref={detailsTableRef}>
        <OpportunityDetailsTable
          draft={draft}
          onDraftChange={handleDraftChange}
          nextTableRef={routeTableRef}
        />
      </div>

      {/* Route Section */}
      <div ref={routeTableRef}>
        <OpportunityRouteTable
          draft={draft}
          onDraftChange={handleDraftChange}
          prevTableRef={detailsTableRef}
          nextTableRef={cargoTableRef}
        />
      </div>

      {/* Cargo Section */}
      <div ref={cargoTableRef}>
        <OpportunityCargoTable
          cargoItems={cargoItems}
          onCargoItemsChange={handleCargoItemsChange}
          prevTableRef={routeTableRef}
        />
      </div>

      {/* Description */}
      <div className="border rounded-lg">
        <div className="px-3 py-1.5 border-b">
          <h3 className="text-sm font-medium">Description</h3>
        </div>
        <div className="p-3">
          <textarea
            className="w-full h-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            placeholder="Additional notes or description..."
            value={draft.description ?? ''}
            onChange={(e) => handleDraftChange({ description: e.target.value || null })}
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
          Create Opportunity
        </Button>
      </div>

      {/* Keyboard hint */}
      <div className="text-xs text-muted-foreground text-center">
        Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Cmd+Enter</kbd> to save
      </div>
    </div>
  )
}
