import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Copy } from 'lucide-react'
import { FMS_CHARGE_UNITS } from '../../fms_offers/data/types'
import type { RfqBoardCard } from '../lib/types'
import { DIRECTION_OPTIONS, TRANSPORT_MODE_OPTIONS, CARGO_TYPE_OPTIONS } from '../lib/chip-options'
import { ChipSelector } from './ChipSelector'
import { ChargesTable, type ChargeRow } from './ChargesTable'
import { LocationSearchInput } from './LocationSearchInput'
import { SwapButton, ExpandableLocationSlot } from './shared-inputs'

type OfferCreationFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  rfq: RfqBoardCard
  onCreated: (offerId: string) => void
}

export type OfferCreationFormContentProps = {
  rfq: RfqBoardCard
  direction: string
  transportMode: string
  cargoType: string
  onCreated: (offerId: string) => void
  onCancel?: () => void
  hideFooter?: boolean
  onSubmitRef?: React.MutableRefObject<(() => void) | null>
  onSubmittingChange?: (submitting: boolean) => void
  initialLocations?: {
    originLocationId: string | null
    destinationLocationId: string | null
    placeOfLoadingId: string | null
    placeOfDeliveryId: string | null
  }
}

type ProductItem = {
  id: string
  name: string
  chargeCode?: string | null
  chargeUnit?: string | null
}

type CalculationState = {
  id: string
  originLocationId: string | null
  destinationLocationId: string | null
  placeOfLoadingId: string | null
  placeOfDeliveryId: string | null
  showLoading: boolean
  showDelivery: boolean
  chargeRows: ChargeRow[]
}

let calcIdCounter = 0
function nextCalcId() {
  return `calc-${++calcIdCounter}`
}

function createEmptyCalc(): CalculationState {
  return {
    id: nextCalcId(),
    originLocationId: null,
    destinationLocationId: null,
    placeOfLoadingId: null,
    placeOfDeliveryId: null,
    showLoading: false,
    showDelivery: false,
    chargeRows: [],
  }
}

/**
 * Embeddable offer creation form body — renders calculation cards with
 * containers, locations, and charges table. Shipment details (direction,
 * transport mode, cargo type) are received as props from the parent.
 */
export function OfferCreationFormContent({
  rfq,
  direction,
  transportMode,
  cargoType,
  onCreated,
  onCancel,
  hideFooter,
  onSubmitRef,
  onSubmittingChange,
  initialLocations,
}: OfferCreationFormContentProps) {
  const t = useT()
  const [submitting, setSubmitting] = useState(false)

  const [calculations, setCalculations] = useState<CalculationState[]>(() => {
    const initial = createEmptyCalc()
    if (initialLocations) {
      initial.originLocationId = initialLocations.originLocationId
      initial.destinationLocationId = initialLocations.destinationLocationId
      initial.placeOfLoadingId = initialLocations.placeOfLoadingId
      initial.placeOfDeliveryId = initialLocations.placeOfDeliveryId
      initial.showLoading = initialLocations.placeOfLoadingId != null
      initial.showDelivery = initialLocations.placeOfDeliveryId != null
    }
    return [initial]
  })

  // Sync first calculation's locations when initialLocations changes (e.g. after RFQ edit/save)
  useEffect(() => {
    if (!initialLocations) return
    setCalculations((prev) => {
      if (prev.length === 0) return prev
      const first = prev[0]
      if (
        first.originLocationId === initialLocations.originLocationId
        && first.destinationLocationId === initialLocations.destinationLocationId
        && first.placeOfLoadingId === initialLocations.placeOfLoadingId
        && first.placeOfDeliveryId === initialLocations.placeOfDeliveryId
      ) return prev
      return [
        {
          ...first,
          originLocationId: initialLocations.originLocationId,
          destinationLocationId: initialLocations.destinationLocationId,
          placeOfLoadingId: initialLocations.placeOfLoadingId,
          placeOfDeliveryId: initialLocations.placeOfDeliveryId,
          showLoading: initialLocations.placeOfLoadingId != null,
          showDelivery: initialLocations.placeOfDeliveryId != null,
        },
        ...prev.slice(1),
      ]
    })
  }, [
    initialLocations?.originLocationId,
    initialLocations?.destinationLocationId,
    initialLocations?.placeOfLoadingId,
    initialLocations?.placeOfDeliveryId,
  ])

  const updateCalc = useCallback((calcId: string, updates: Partial<CalculationState>) => {
    setCalculations((prev) => prev.map((calc) => calc.id === calcId ? { ...calc, ...updates } : calc))
  }, [])

  const duplicateCalc = useCallback((calcId: string) => {
    setCalculations((prev) => {
      const idx = prev.findIndex((calc) => calc.id === calcId)
      if (idx === -1) return prev
      const source = prev[idx]
      const copy: CalculationState = {
        ...source,
        id: nextCalcId(),
        chargeRows: source.chargeRows.map((row, i) => ({ ...row, id: `copy-${Date.now()}-${i}` })),
      }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }, [])

  const { data: products } = useQuery({
    queryKey: ['fms-products-for-offer', transportMode],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (transportMode) params.set('transportMode', transportMode)
      const res = await apiCall<{ items: ProductItem[] }>(`/api/fms_products/products?${params}`)
      return res.result?.items || []
    },
  })

  const buildDefaultRows = useCallback((productItems: ProductItem[]): ChargeRow[] => {
    return productItems.map((product, index) => ({
      id: `new-${Date.now()}-${index}`,
      productId: product.id,
      productName: product.name || 'Unnamed Product',
      chargeCode: product.chargeCode || '',
      chargeBasis: product.chargeUnit || '',
      containerType: null,
      currencyCode: 'USD',
      rate: 0,
      marginPercent: 0,
      buyPrice: 0,
      sellPrice: 0,
      isEnabled: false,
    }))
  }, [])

  useEffect(() => {
    if (products && products.length > 0) {
      const defaultRows = buildDefaultRows(products)
      setCalculations((prev) =>
        prev.map((calc) => ({ ...calc, chargeRows: defaultRows.map((r) => ({ ...r })) })),
      )
    }
  }, [products, buildDefaultRows])

  const total = useMemo(() => {
    return calculations.reduce((sum, calc) =>
      sum + calc.chargeRows
        .filter((row) => row.isEnabled)
        .reduce((s, row) => s + (row.sellPrice || 0), 0),
    0)
  }, [calculations])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + 30)

      const offerRes = await apiCall<{ id: string; calculations?: Array<{ id: string }> }>(
        '/api/fms_offers/offers',
        {
          method: 'POST',
          body: JSON.stringify({
            rfqId: rfq.id,
            contractorId: (rfq as any).contractorId || null,
            contactPersonId: (rfq as any).contactPersonId || null,
            validUntil: validUntil.toISOString(),
            direction: direction || null,
            transportMode: transportMode || null,
            cargoType: cargoType || null,
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      )

      const offer = offerRes.result
      if (!offer?.id) throw new Error('Failed to create offer')

      const calcId = offer.calculations?.[0]?.id

      for (const calc of calculations) {
        if (calcId) {
          await apiCall(`/api/fms_offers/calculations/${calcId}`, {
            method: 'PUT',
            body: JSON.stringify({
              originLocationId: calc.originLocationId,
              destinationLocationId: calc.destinationLocationId,
              placeOfLoadingId: calc.showLoading ? calc.placeOfLoadingId : null,
              placeOfDeliveryId: calc.showDelivery ? calc.placeOfDeliveryId : null,
            }),
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const enabledRows = calc.chargeRows.filter((row) => row.isEnabled)
        if (enabledRows.length > 0 && calcId) {
          await Promise.all(
            enabledRows.map((row) =>
              apiCall('/api/fms_offers/offer-lines', {
                method: 'POST',
                body: JSON.stringify({
                  calculationId: calcId,
                  productId: row.productId,
                  productName: row.productName,
                  chargeCode: row.chargeCode,
                  chargeBasis: row.chargeBasis && (FMS_CHARGE_UNITS as readonly string[]).includes(row.chargeBasis) ? row.chargeBasis : null,
                  containerType: row.containerType || null,
                  currencyCode: row.currencyCode,
                  rate: row.rate,
                  buyPrice: row.buyPrice,
                  sellPrice: row.sellPrice,
                  isEnabled: true,
                }),
                headers: { 'Content-Type': 'application/json' },
              }),
            ),
          )
        }
      }

      await apiCall(`/api/fms_offers/rfq/${rfq.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'in_progress' }),
        headers: { 'Content-Type': 'application/json' },
      })

      onCreated(offer.id)
    } catch (error) {
      console.error('[OfferCreationForm] Failed to create offer:', error)
    } finally {
      setSubmitting(false)
    }
  }, [rfq.id, direction, transportMode, cargoType, calculations, onCreated])

  useEffect(() => {
    if (onSubmitRef) onSubmitRef.current = handleSubmit
    return () => { if (onSubmitRef) onSubmitRef.current = null }
  }, [handleSubmit, onSubmitRef])

  useEffect(() => {
    onSubmittingChange?.(submitting)
  }, [submitting, onSubmittingChange])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleSwapLocations = useCallback((calcId: string) => {
    setCalculations((prev) => prev.map((calc) => {
      if (calc.id !== calcId) return calc
      return { ...calc, originLocationId: calc.destinationLocationId, destinationLocationId: calc.originLocationId }
    }))
  }, [])

  const toggleLoading = useCallback((calcId: string) => {
    setCalculations((prev) => prev.map((calc) => {
      if (calc.id !== calcId) return calc
      return { ...calc, showLoading: !calc.showLoading, placeOfLoadingId: calc.showLoading ? null : calc.placeOfLoadingId }
    }))
  }, [])

  const toggleDelivery = useCallback((calcId: string) => {
    setCalculations((prev) => prev.map((calc) => {
      if (calc.id !== calcId) return calc
      return { ...calc, showDelivery: !calc.showDelivery, placeOfDeliveryId: calc.showDelivery ? null : calc.placeOfDeliveryId }
    }))
  }, [])

  return (
    <div onKeyDown={handleKeyDown}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

      {/* Calculation Cards */}
      {calculations.map((calc) => (
        <div
          key={calc.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px 20px',
            position: 'relative',
            marginBottom: '12px',
          }}
        >
          {/* Copy button */}
          <button
            type="button"
            onClick={() => duplicateCalc(calc.id)}
            title="Duplicate calculation"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 28,
              height: 28,
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = 'var(--foreground)'
              event.currentTarget.style.color = 'var(--foreground)'
              event.currentTarget.style.background = 'var(--accent)'
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = 'var(--border)'
              event.currentTarget.style.color = 'var(--muted-foreground)'
              event.currentTarget.style.background = 'var(--background)'
            }}
          >
            <Copy style={{ width: 14, height: 14 }} />
          </button>

          {/* Location row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '14px',
              paddingTop: (calc.showLoading || calc.showDelivery) ? '18px' : '0',
              transition: 'padding-top 0.3s ease',
            }}
          >
            <ExpandableLocationSlot
              expanded={calc.showLoading}
              onToggle={() => toggleLoading(calc.id)}
              value={calc.placeOfLoadingId}
              onChange={(v) => updateCalc(calc.id, { placeOfLoadingId: v })}
              label={t('tasks_board.offerForm.placeOfLoading', 'Place of Loading')}
              placeholder={t('tasks_board.offerForm.selectLocation', 'Select location...')}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <LocationSearchInput
                value={calc.originLocationId}
                onChange={(v) => updateCalc(calc.id, { originLocationId: v })}
                placeholder={t('tasks_board.offerForm.from', 'From')}
              />
            </div>

            <div style={{ flexShrink: 0 }}>
              <SwapButton onClick={() => handleSwapLocations(calc.id)} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <LocationSearchInput
                value={calc.destinationLocationId}
                onChange={(v) => updateCalc(calc.id, { destinationLocationId: v })}
                placeholder={t('tasks_board.offerForm.to', 'To')}
              />
            </div>

            <ExpandableLocationSlot
              expanded={calc.showDelivery}
              onToggle={() => toggleDelivery(calc.id)}
              value={calc.placeOfDeliveryId}
              onChange={(v) => updateCalc(calc.id, { placeOfDeliveryId: v })}
              label={t('tasks_board.offerForm.placeOfDelivery', 'Place of Delivery')}
              placeholder={t('tasks_board.offerForm.selectLocation', 'Select location...')}
            />
          </div>

          {/* Charges */}
          <div style={{ marginTop: '12px' }}>
            <ChargesTable
              rows={calc.chargeRows}
              onChange={(rows) => updateCalc(calc.id, { chargeRows: rows })}
              transportMode={transportMode}
            />
          </div>
        </div>
      ))}

      {/* Inline footer for offer actions */}
      {!hideFooter && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingTop: '12px',
            gap: '8px',
          }}
        >
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={submitting}>
              {t('ui.cancel', 'Cancel')}
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? t('tasks_board.offerForm.creating', 'Creating...')
              : t('tasks_board.offerForm.create', 'Create Offer')}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Standalone Sheet wrapper — used when the offer form is opened separately
 * (not as part of the inline detail view).
 */
export function OfferCreationForm({ open, onOpenChange, rfq, onCreated }: OfferCreationFormProps) {
  const [direction, setDirection] = useState<string>(rfq.direction || '')
  const [transportMode, setTransportMode] = useState<string>(rfq.transportMode || '')
  const [cargoType, setCargoType] = useState<string>(rfq.cargoType || '')
  const t = useT()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{ width: '55vw', maxWidth: '960px', minWidth: '640px' }}
        hideCloseButton
        ariaTitle="Create Offer"
        overlayClassName="backdrop-blur-none"
      >
        <div className="flex flex-col h-full">
          {/* Shipment Details Card for standalone mode */}
          <div
            style={{
              borderBottom: '1px solid var(--border)',
              padding: '20px 24px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <ChipSelector
                label={t('tasks_board.offerForm.direction', 'Direction')}
                options={DIRECTION_OPTIONS}
                selected={direction}
                onChange={(value) => setDirection(value as string)}
              />
              <ChipSelector
                label={t('tasks_board.offerForm.transportMode', 'Transport Mode')}
                options={TRANSPORT_MODE_OPTIONS}
                selected={transportMode}
                onChange={(value) => setTransportMode(value as string)}
              />
              <ChipSelector
                label={t('tasks_board.offerForm.cargoType', 'Cargo Type')}
                options={CARGO_TYPE_OPTIONS}
                selected={cargoType}
                onChange={(value) => setCargoType(value as string)}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <OfferCreationFormContent
              rfq={rfq}
              direction={direction}
              transportMode={transportMode}
              cargoType={cargoType}
              onCreated={onCreated}
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
