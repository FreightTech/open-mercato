import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Ship,
  Plane,
  Truck,
  TrainFront,
  Container,
  Package,
  AlertTriangle,
  Snowflake,
  Maximize2,
  Copy,
  Plus,
  Minus,
} from 'lucide-react'
import type { RfqBoardCard } from '../lib/types'
import { ChipSelector } from './ChipSelector'
import { ChargesTable, type ChargeRow } from './ChargesTable'
import { LocationSearchInput } from './LocationSearchInput'

type OfferCreationFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  rfq: RfqBoardCard
  onCreated: () => void
}

const ICON_SIZE = 'h-3.5 w-3.5'

const DIRECTION_OPTIONS = [
  { value: 'import', label: 'Import', icon: <ArrowDownToLine className={ICON_SIZE} /> },
  { value: 'export', label: 'Export', icon: <ArrowUpFromLine className={ICON_SIZE} /> },
  { value: 'both', label: 'Both', icon: <ArrowLeftRight className={ICON_SIZE} /> },
]

const TRANSPORT_MODE_OPTIONS = [
  { value: 'sea', label: 'Sea', icon: <Ship className={ICON_SIZE} /> },
  { value: 'air', label: 'Air', icon: <Plane className={ICON_SIZE} /> },
  { value: 'road', label: 'Road', icon: <Truck className={ICON_SIZE} /> },
  { value: 'rail', label: 'Rail', icon: <TrainFront className={ICON_SIZE} /> },
  { value: 'barge', label: 'Barge', icon: <Container className={ICON_SIZE} /> },
]

const CARGO_TYPE_OPTIONS = [
  { value: 'general', label: 'General', icon: <Package className={ICON_SIZE} /> },
  { value: 'dangerous', label: 'Dangerous', icon: <AlertTriangle className={ICON_SIZE} /> },
  { value: 'perishable', label: 'Perishable', icon: <Snowflake className={ICON_SIZE} /> },
  { value: 'oog', label: 'OOG', icon: <Maximize2 className={ICON_SIZE} /> },
]

const CONTAINER_OPTIONS = [
  { value: '20GP', label: '20GP' },
  { value: '40GP', label: '40GP' },
  { value: '40HC', label: '40HC' },
  { value: '45HC', label: '45HC' },
  { value: '20RF', label: '20RF' },
  { value: '40RF', label: '40RF' },
  { value: '40RH', label: '40RH' },
  { value: 'LCL', label: 'LCL' },
]

type ProductItem = {
  id: string
  name: string
  chargeCode?: { code?: string; chargeUnit?: string } | null
}

function SwapButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Swap locations"
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1.5px solid var(--border)',
        background: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        color: 'var(--muted-foreground)',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = 'var(--foreground)'
        event.currentTarget.style.color = 'var(--foreground)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = 'var(--border)'
        event.currentTarget.style.color = 'var(--muted-foreground)'
      }}
    >
      <ArrowLeftRight style={{ width: 14, height: 14 }} />
    </button>
  )
}

/**
 * Expandable location slot.
 * Collapsed: renders a dashed (+) circle button.
 * Expanded: the circle grows into a full LocationSearchInput with a (-) button.
 */
function ExpandableLocationSlot({
  expanded,
  onToggle,
  value,
  onChange,
  label,
  placeholder,
}: {
  expanded: boolean
  onToggle: () => void
  value: string | null
  onChange: (value: string | null) => void
  label: string
  placeholder: string
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        transition: 'flex 0.3s ease, min-width 0.3s ease',
        flex: expanded ? '1 1 0%' : '0 0 auto',
        minWidth: expanded ? '120px' : '30px',
      }}
    >
      {expanded && (
        <span
          style={{
            position: 'absolute',
            top: '-16px',
            left: '38px',
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            animation: 'fadeIn 0.2s ease 0.15s both',
          }}
        >
          {label}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
        <button
          type="button"
          onClick={onToggle}
          title={expanded ? `Remove ${label}` : `Add ${label}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `1.5px ${expanded ? 'solid' : 'dashed'} color-mix(in srgb, var(--foreground) 25%, var(--border))`,
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
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
            event.currentTarget.style.background = 'transparent'
          }}
        >
          {expanded
            ? <Minus style={{ width: 14, height: 14 }} />
            : <Plus style={{ width: 14, height: 14 }} />}
        </button>
        {expanded && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <LocationSearchInput
              value={value}
              onChange={onChange}
              placeholder={placeholder}
            />
          </div>
        )}
      </div>
    </div>
  )
}

type CalculationState = {
  id: string
  containers: string[]
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
    containers: [],
    originLocationId: null,
    destinationLocationId: null,
    placeOfLoadingId: null,
    placeOfDeliveryId: null,
    showLoading: false,
    showDelivery: false,
    chargeRows: [],
  }
}

export function OfferCreationForm({ open, onOpenChange, rfq, onCreated }: OfferCreationFormProps) {
  const t = useT()
  const [submitting, setSubmitting] = useState(false)

  const [direction, setDirection] = useState<string>(rfq.direction || '')
  const [transportMode, setTransportMode] = useState<string>(rfq.transportMode || '')
  const [cargoType, setCargoType] = useState<string>(rfq.cargoType || '')

  const [calculations, setCalculations] = useState<CalculationState[]>(() => [createEmptyCalc()])

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
    queryKey: ['fms-products-for-offer'],
    queryFn: async () => {
      const res = await apiCall<{ items: ProductItem[] }>('/api/fms_products/products?limit=100')
      return res.result?.items || []
    },
    enabled: open,
  })

  const buildDefaultRows = useCallback((products: ProductItem[]): ChargeRow[] => {
    return products.map((product, index) => ({
      id: `new-${Date.now()}-${index}`,
      productId: product.id,
      productName: product.name || 'Unnamed Product',
      chargeCode: product.chargeCode?.code || '',
      chargeBasis: product.chargeCode?.chargeUnit || '',
      currencyCode: 'USD',
      rate: 0,
      marginPercent: 0,
      buyPrice: 0,
      sellPrice: 0,
      isEnabled: false,
    }))
  }, [])

  useEffect(() => {
    if (open && products && products.length > 0) {
      setCalculations((prev) => prev.map((calc) => {
        if (calc.chargeRows.length === 0) {
          return { ...calc, chargeRows: buildDefaultRows(products) }
        }
        return calc
      }))
    }
  }, [open, products, buildDefaultRows])

  useEffect(() => {
    if (open) {
      setDirection(rfq.direction || '')
      setTransportMode(rfq.transportMode || '')
      setCargoType(rfq.cargoType || '')
      setCalculations([createEmptyCalc()])
    }
  }, [open, rfq])

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
          await apiCall(`/api/fms_offers/offer-lines/${calcId}`, {
            method: 'PUT',
            body: JSON.stringify({
              containers: calc.containers.length > 0 ? calc.containers : null,
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
                  chargeBasis: row.chargeBasis,
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

      onCreated()
    } catch (error) {
      console.error('[OfferCreationForm] Failed to create offer:', error)
    } finally {
      setSubmitting(false)
    }
  }, [rfq.id, direction, transportMode, cargoType, calculations, onCreated])

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{ width: '55vw', maxWidth: '960px', minWidth: '640px' }}
        hideCloseButton
        ariaTitle="Create Offer"
        overlayClassName="backdrop-blur-none"
        onKeyDown={handleKeyDown}
      >
        {/* inject animation keyframes */}
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

        {/* ── Body ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* ── Shipment Details Card ── */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px 22px',
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

          {/* ── Calculation Cards ── */}
          {calculations.map((calc, calcIndex) => (
            <div
              key={calc.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '20px 20px',
                position: 'relative',
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
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--foreground)'
                  e.currentTarget.style.color = 'var(--foreground)'
                  e.currentTarget.style.background = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--muted-foreground)'
                  e.currentTarget.style.background = 'var(--background)'
                }}
              >
                <Copy style={{ width: 14, height: 14 }} />
              </button>

              {/* Containers */}
              <ChipSelector
                label={t('tasks_board.offerForm.containers', 'Containers')}
                options={CONTAINER_OPTIONS}
                selected={calc.containers}
                onChange={(value) => updateCalc(calc.id, { containers: value as string[] })}
                multiple
              />

              {/* ── Location row ── */}
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

              {/* ── Charges ── */}
              <div style={{ marginTop: '12px' }}>
                <ChargesTable
                  rows={calc.chargeRows}
                  onChange={(rows) => updateCalc(calc.id, { chargeRows: rows })}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.04)',
            flexShrink: 0,
            background: 'var(--card)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t('ui.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? t('tasks_board.offerForm.creating', 'Creating...')
                : t('tasks_board.offerForm.create', 'Create Offer')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
