import React, { useState, useCallback, useEffect } from 'react'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useQuery } from '@tanstack/react-query'
import {
  X,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
} from 'lucide-react'
import type { RfqBoardCard, BoardColumn } from '../lib/types'
import { ChargesTable, type ChargeRow } from './ChargesTable'
import { HighlightedText } from './HighlightedText'
import { OfferDetailView } from './OfferDetailView'
import { LocationSearchInput } from './LocationSearchInput'
import { SwapButton, ExpandableLocationSlot } from './shared-inputs'
import { ChipSelector } from './ChipSelector'
import { ChargesToolbar } from './ChargesToolbar'
import { ImportFromCarrierDialog } from './ImportFromCarrierDialog'
import { FromHistoryDialog } from './FromHistoryDialog'
import { TRANSPORT_MODE_OPTIONS, CONTAINER_OPTIONS } from '../lib/chip-options'

type TaskDetailSheetProps = {
  task: RfqBoardCard | null
  columns: BoardColumn[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onOfferCreated: () => void
}

type RfqItem = {
  id: string
  itemNumber: number
  containerType: string | null
  containerCount: number | null
  origin: string | null
  destination: string | null
  cargoDescription: string | null
  weightKg: string | null
  readinessDate: string | null
  incoterm: string | null
  transportMode: string | null
  notes: string | null
}

type RfqDetailData = {
  offers: Array<{ id: string; offerNumber: string; status: string; version: number; createdAt: string }>
  items: RfqItem[]
  rawText: string | null
  senderEmail: string | null
  senderName: string | null
  companyName: string | null
  contactPerson: string | null
  extractedData: Record<string, unknown> | null
  highlights: Array<{ start: number; end: number; type: string; label: string }> | null
  context: string | null
}

type ProductItem = {
  id: string
  name: string
  chargeCode?: string | null
  chargeUnit?: string | null
}

type LocalItem = {
  containerType: string | null
  containerCount: number | null
  origin: string | null
  originLocationId: string | null
  destination: string | null
  destinationLocationId: string | null
  placeOfLoading: string | null
  placeOfLoadingId: string | null
  placeOfDelivery: string | null
  placeOfDeliveryId: string | null
  cargoDescription: string | null
  weightKg: string | null
  readinessDate: string | null
  incoterm: string | null
  transportMode: string | null
  notes: string | null
}

function makeEmptyItem(): LocalItem {
  return {
    containerType: null,
    containerCount: null,
    origin: null,
    originLocationId: null,
    destination: null,
    destinationLocationId: null,
    placeOfLoading: null,
    placeOfLoadingId: null,
    placeOfDelivery: null,
    placeOfDeliveryId: null,
    cargoDescription: null,
    weightKg: null,
    readinessDate: null,
    incoterm: null,
    transportMode: null,
    notes: null,
  }
}

function rfqItemToLocal(item: RfqItem): LocalItem {
  return {
    containerType: item.containerType,
    containerCount: item.containerCount,
    origin: item.origin,
    originLocationId: null,
    destination: item.destination,
    destinationLocationId: null,
    placeOfLoading: null,
    placeOfLoadingId: null,
    placeOfDelivery: null,
    placeOfDeliveryId: null,
    cargoDescription: item.cargoDescription,
    weightKg: item.weightKg,
    readinessDate: item.readinessDate,
    incoterm: item.incoterm,
    transportMode: item.transportMode,
    notes: item.notes,
  }
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '8px',
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
}: TaskDetailSheetProps) {
  const t = useT()
  const [viewingOfferId, setViewingOfferId] = useState<string | null>(null)
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set())
  const [localItems, setLocalItems] = useState<LocalItem[]>([])
  const [calculations, setCalculations] = useState<Array<{ chargeRows: ChargeRow[] }>>([])
  const [editingItems, setEditingItems] = useState<Set<number>>(new Set())
  const [expandedPol, setExpandedPol] = useState<Set<number>>(new Set())
  const [expandedPod, setExpandedPod] = useState<Set<number>>(new Set())
  const [importDialogItem, setImportDialogItem] = useState<number | null>(null)
  const [historyDialogItem, setHistoryDialogItem] = useState<number | null>(null)

  // Fetch RFQ detail
  const { data: rfqDetail } = useQuery({
    queryKey: ['rfq-detail', task?.id],
    queryFn: async () => {
      if (!task?.id) return null
      const res = await apiCall<RfqDetailData>(`/api/fms_offers/rfq/${task.id}`)
      if (!res.ok || !res.result) return null
      return res.result
    },
    enabled: !!task?.id && open,
  })

  // Initialize local items from rfqDetail
  useEffect(() => {
    if (!rfqDetail) return
    const serverItems = rfqDetail.items
    if (serverItems.length > 0) {
      setLocalItems(serverItems.map(rfqItemToLocal))
      setCalculations(serverItems.map(() => ({ chargeRows: [] })))
      setExpandedBoxes(new Set(serverItems.map((_, i) => i)))
    } else {
      setLocalItems([makeEmptyItem()])
      setCalculations([{ chargeRows: [] }])
      setExpandedBoxes(new Set([0]))
    }
  }, [rfqDetail])

  // Reset state when task changes
  useEffect(() => {
    if (task && open) {
      setViewingOfferId(null)
      setEditingItems(new Set())
    }
  }, [task, open])

  // Fetch products by transportMode
  const transportMode = localItems.find((item) => item.transportMode)?.transportMode || task?.transportMode || null
  const { data: products } = useQuery({
    queryKey: ['fms-products-for-offer', transportMode],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (transportMode) params.set('transportMode', transportMode)
      const res = await apiCall<{ items: ProductItem[] }>(`/api/fms_products/products?${params}`)
      return res.result?.items || []
    },
    enabled: !!transportMode,
  })

  // Populate default charge rows when products load
  useEffect(() => {
    if (!products || products.length === 0) return
    const defaultRows: ChargeRow[] = products.map((product, index) => ({
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
    setCalculations((prev) =>
      prev.map((calc) =>
        calc.chargeRows.length > 0 ? calc : { ...calc, chargeRows: defaultRows.map((r) => ({ ...r, id: `${r.id}-${Math.random()}` })) },
      ),
    )
  }, [products])

  const updateCalculation = useCallback((index: number, chargeRows: ChargeRow[]) => {
    setCalculations((prev) =>
      prev.map((calc, i) => (i === index ? { ...calc, chargeRows } : calc)),
    )
  }, [])

  const updateItem = useCallback((index: number, patch: Partial<LocalItem>) => {
    setLocalItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )
  }, [])

  const toggleEditing = useCallback((idx: number) => {
    setEditingItems((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleAddItem = useCallback(() => {
    const defaultRows: ChargeRow[] = (products || []).map((product, index) => ({
      id: `new-${Date.now()}-${index}-${Math.random()}`,
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
    setLocalItems((prev) => [...prev, makeEmptyItem()])
    setCalculations((prev) => [...prev, { chargeRows: defaultRows }])
    setExpandedBoxes((prev) => {
      const next = new Set(prev)
      next.add(localItems.length)
      return next
    })
    // Auto-open edit panel for new empty items
    setEditingItems((prev) => {
      const next = new Set(prev)
      next.add(localItems.length)
      return next
    })
  }, [products, localItems.length])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  if (!task) return null

  const hasRightPanel = !!(rfqDetail?.rawText || rfqDetail?.context)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{
          width: hasRightPanel ? '85vw' : '55vw',
          maxWidth: hasRightPanel ? '1400px' : '960px',
          minWidth: '640px',
          transition: 'width 0.3s ease',
        }}
        hideCloseButton
        ariaTitle="RFQ Details"
        overlayClassName="backdrop-blur-none"
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {viewingOfferId ? (
            <OfferDetailView offerId={viewingOfferId} onBack={() => setViewingOfferId(null)} />
          ) : (
            <>
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 24px',
                  borderBottom: '1px solid var(--border)',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                  {task.title && (
                    <span style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.title}
                    </span>
                  )}
                  {task.companyName && (
                    <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', flexShrink: 0 }}>
                      {task.companyName}
                    </span>
                  )}
                  {(task.origin || task.destination) && (
                    <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', flexShrink: 0 }}>
                      {task.origin || '—'} → {task.destination || '—'}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none ml-3 flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Split layout body */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
                {/* Left panel — item-based boxes */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px 24px',
                    borderRight: hasRightPanel ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {localItems.map((item, idx) => {
                    const isExpanded = expandedBoxes.has(idx)
                    const isEditing = editingItems.has(idx)

                    const hasTransport = !!item.transportMode

                    return (
                      <div
                        key={idx}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                          marginBottom: '12px',
                          overflow: 'visible',
                        }}
                      >
                        {/* Header row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 20px',
                            background: isExpanded ? 'var(--accent)' : 'transparent',
                            borderRadius: '12px 12px 0 0',
                            transition: 'background 0.15s',
                          }}
                        >
                          {/* Chevron + number — expand/collapse */}
                          <button
                            type="button"
                            onClick={() => setExpandedBoxes((prev) => {
                              const next = new Set(prev)
                              if (next.has(idx)) next.delete(idx)
                              else next.add(idx)
                              return next
                            })}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              color: 'var(--foreground)',
                              fontFamily: 'inherit',
                              flexShrink: 0,
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown style={{ width: 16, height: 16, opacity: 0.5 }} />
                            ) : (
                              <ChevronRight style={{ width: 16, height: 16, opacity: 0.5 }} />
                            )}
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                background: 'var(--primary)',
                                color: 'var(--primary-foreground)',
                              }}
                            >
                              #{idx + 1}
                            </span>
                          </button>

                          {/* Container pill */}
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: item.containerType ? 600 : 500,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              flexShrink: 0,
                              ...(item.containerType
                                ? { background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid transparent' }
                                : { background: 'transparent', color: 'var(--muted-foreground)', border: '1px dashed var(--border)' }),
                            }}
                          >
                            {item.containerType
                              ? `${item.containerCount ? `${item.containerCount}x ` : ''}${item.containerType}`
                              : t('tasks_board.detail.containerType', 'Container')}
                          </span>

                          {/* Route chain: POL → Origin → Destination → POD */}
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'var(--foreground)',
                            }}
                          >
                            {(() => {
                              const parts: string[] = []
                              if (item.placeOfLoading) parts.push(item.placeOfLoading)
                              parts.push(item.origin || '?')
                              parts.push(item.destination || '?')
                              if (item.placeOfDelivery) parts.push(item.placeOfDelivery)
                              return parts.join(' → ')
                            })()}
                          </span>

                          {/* Transport mode pill */}
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: hasTransport ? 600 : 500,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              flexShrink: 0,
                              ...(hasTransport
                                ? { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid transparent' }
                                : { background: 'transparent', color: 'var(--muted-foreground)', border: '1px dashed var(--border)' }),
                            }}
                          >
                            {hasTransport
                              ? item.transportMode!.charAt(0).toUpperCase() + item.transportMode!.slice(1)
                              : t('tasks_board.detail.transportMode', 'Transport')}
                          </span>

                          {/* Edit toggle */}
                          <button
                            type="button"
                            onClick={() => toggleEditing(idx)}
                            title={t('tasks_board.detail.edit', 'Edit')}
                            style={{
                              marginLeft: 'auto',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 26,
                              height: 26,
                              borderRadius: '8px',
                              border: 'none',
                              background: isEditing ? 'var(--primary)' : 'transparent',
                              color: isEditing ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                              cursor: 'pointer',
                              flexShrink: 0,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              if (!isEditing) {
                                e.currentTarget.style.background = 'var(--muted)'
                                e.currentTarget.style.color = 'var(--foreground)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isEditing) {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = 'var(--muted-foreground)'
                              }
                            }}
                          >
                            <Pencil style={{ width: 12, height: 12 }} />
                          </button>
                        </div>

                        {/* Expandable edit panel — inline, below header */}
                        {isEditing && (
                          <div
                            style={{
                              padding: '12px 20px 16px',
                              borderTop: '1px solid var(--border)',
                              background: 'color-mix(in srgb, var(--accent) 50%, var(--background))',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '14px',
                            }}
                          >
                            <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

                            {/* Transport Mode + Container Type — side by side */}
                            <div style={{ display: 'flex', gap: '24px' }}>
                              <div>
                                <div style={sectionLabelStyle}>
                                  {t('tasks_board.detail.transportMode', 'Transport Mode')}
                                </div>
                                <ChipSelector
                                  options={TRANSPORT_MODE_OPTIONS}
                                  selected={item.transportMode || ''}
                                  onChange={(value) => updateItem(idx, { transportMode: (value as string) || null })}
                                />
                              </div>
                              <div>
                                <div style={sectionLabelStyle}>
                                  {t('tasks_board.detail.containerType', 'Container')}
                                </div>
                                <ChipSelector
                                  options={CONTAINER_OPTIONS}
                                  selected={item.containerType || ''}
                                  onChange={(value) => updateItem(idx, { containerType: (value as string) || null })}
                                />
                              </div>
                            </div>

                            {/* Locations — single row: [POL circle] [Origin] [Swap] [Destination] [POD circle] */}
                            <div>
                              <div style={sectionLabelStyle}>
                                {t('tasks_board.detail.route', 'Route')}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  paddingTop: (expandedPol.has(idx) || expandedPod.has(idx)) ? '18px' : '0',
                                  transition: 'padding-top 0.3s ease',
                                }}
                              >
                                <ExpandableLocationSlot
                                  expanded={expandedPol.has(idx)}
                                  onToggle={() => {
                                    setExpandedPol((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(idx)) {
                                        next.delete(idx)
                                        updateItem(idx, { placeOfLoadingId: null, placeOfLoading: null })
                                      } else {
                                        next.add(idx)
                                      }
                                      return next
                                    })
                                  }}
                                  value={item.placeOfLoadingId}
                                  onChange={(locationId, name) => updateItem(idx, { placeOfLoadingId: locationId, placeOfLoading: name || null })}
                                  label={t('tasks_board.detail.portOfLoading', 'Port of Loading')}
                                  placeholder={t('tasks_board.detail.portOfLoading', 'Port of Loading')}
                                />

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <LocationSearchInput
                                    value={item.originLocationId}
                                    onChange={(locationId, name) => updateItem(idx, { originLocationId: locationId, origin: name || null })}
                                    placeholder={item.origin || t('tasks_board.wizard.from', 'From')}
                                  />
                                </div>

                                <div style={{ flexShrink: 0 }}>
                                  <SwapButton onClick={() => updateItem(idx, {
                                    originLocationId: item.destinationLocationId,
                                    origin: item.destination,
                                    destinationLocationId: item.originLocationId,
                                    destination: item.origin,
                                  })} />
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <LocationSearchInput
                                    value={item.destinationLocationId}
                                    onChange={(locationId, name) => updateItem(idx, { destinationLocationId: locationId, destination: name || null })}
                                    placeholder={item.destination || t('tasks_board.wizard.to', 'To')}
                                  />
                                </div>

                                <ExpandableLocationSlot
                                  expanded={expandedPod.has(idx)}
                                  onToggle={() => {
                                    setExpandedPod((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(idx)) {
                                        next.delete(idx)
                                        updateItem(idx, { placeOfDeliveryId: null, placeOfDelivery: null })
                                      } else {
                                        next.add(idx)
                                      }
                                      return next
                                    })
                                  }}
                                  value={item.placeOfDeliveryId}
                                  onChange={(locationId, name) => updateItem(idx, { placeOfDeliveryId: locationId, placeOfDelivery: name || null })}
                                  label={t('tasks_board.detail.portOfDischarge', 'Port of Discharge')}
                                  placeholder={t('tasks_board.detail.portOfDischarge', 'Port of Discharge')}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Expanded content — cargo + charges */}
                        {isExpanded && (
                          <div style={{ padding: '0 20px 16px' }}>
                            {item.cargoDescription && (
                              <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '8px', padding: '0 4px' }}>
                                {item.cargoDescription}
                                {item.weightKg ? ` (${item.weightKg} kg)` : ''}
                                {item.readinessDate ? ` · ${t('tasks_board.wizard.readiness', 'Readiness')}: ${item.readinessDate}` : ''}
                                {item.incoterm ? ` · ${item.incoterm.toUpperCase()}` : ''}
                              </div>
                            )}
                            <ChargesTable
                              rows={calculations[idx]?.chargeRows || []}
                              onChange={(rows) => updateCalculation(idx, rows)}
                              transportMode={item.transportMode || undefined}
                            />
                            <ChargesToolbar
                              onAddLine={() => {
                                const newRow: ChargeRow = {
                                  id: `new-${Date.now()}-${Math.random()}`,
                                  productId: null,
                                  productName: '',
                                  chargeCode: '',
                                  chargeBasis: '',
                                  containerType: null,
                                  currencyCode: 'USD',
                                  rate: 0,
                                  marginPercent: 0,
                                  buyPrice: 0,
                                  sellPrice: 0,
                                  isEnabled: true,
                                }
                                updateCalculation(idx, [...(calculations[idx]?.chargeRows || []), newRow])
                              }}
                              onImportFromCarrier={() => setImportDialogItem(idx)}
                              onFromHistory={() => setHistoryDialogItem(idx)}
                              onAiPricing={() => {}}
                            />
                            <ImportFromCarrierDialog
                              open={importDialogItem === idx}
                              onOpenChange={(open) => { if (!open) setImportDialogItem(null) }}
                              onImport={(rows) => updateCalculation(idx, [...(calculations[idx]?.chargeRows || []), ...rows])}
                              itemLabel={`#${idx + 1} · ${item.origin || '?'} → ${item.destination || '?'}`}
                            />
                            <FromHistoryDialog
                              open={historyDialogItem === idx}
                              onOpenChange={(open) => { if (!open) setHistoryDialogItem(null) }}
                              onSelectOffer={(rows) => updateCalculation(idx, [...(calculations[idx]?.chargeRows || []), ...rows])}
                              currentOrigin={item.origin}
                              currentDestination={item.destination}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Add item button */}
                  <button
                    type="button"
                    onClick={handleAddItem}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--muted-foreground)',
                      background: 'none',
                      border: '1px dashed var(--border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'color 0.15s, border-color 0.15s',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.borderColor = 'var(--foreground)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-foreground)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                    {t('tasks_board.detail.addItem', 'Add item')}
                  </button>
                </div>

                {/* Right panel — original message / context */}
                {hasRightPanel && (
                  <div
                    style={{
                      width: '420px',
                      flexShrink: 0,
                      overflowY: 'auto',
                      padding: '20px 24px',
                      background: 'var(--card)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--muted-foreground)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '12px',
                      }}
                    >
                      {rfqDetail?.rawText
                        ? t('tasks_board.wizard.originalMessage', 'Original Message')
                        : t('tasks_board.detail.context', 'Additional Context')}
                    </div>
                    {rfqDetail?.rawText && rfqDetail?.highlights ? (
                      <HighlightedText
                        text={rfqDetail.rawText}
                        highlights={rfqDetail.highlights}
                        senderEmail={rfqDetail.senderEmail}
                        senderName={rfqDetail.senderName}
                        companyName={rfqDetail.companyName}
                      />
                    ) : rfqDetail?.rawText ? (
                      <div
                        style={{
                          padding: '16px',
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          background: 'var(--background)',
                          fontSize: '13px',
                          lineHeight: '1.7',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: '500px',
                          overflowY: 'auto',
                        }}
                      >
                        {rfqDetail.rawText}
                      </div>
                    ) : rfqDetail?.context ? (
                      <div
                        style={{
                          padding: '16px',
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          background: 'var(--background)',
                          fontSize: '13px',
                          lineHeight: '1.7',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {rfqDetail.context}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
