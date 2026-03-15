import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Sheet, SheetContent } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { X, ArrowRight, ArrowLeft, ChevronDown, ChevronRight, Send, Pencil } from 'lucide-react'
import { RfqWizardStepper } from './RfqWizardStepper'
import { RfqTextInput } from './RfqTextInput'
import { HighlightedText } from './HighlightedText'
import { ChargesTable, type ChargeRow } from './ChargesTable'
import { LocationSearchInput } from './LocationSearchInput'
import { SwapButton, ExpandableLocationSlot } from './shared-inputs'
import { ChipSelector } from './ChipSelector'
import { ChargesToolbar } from './ChargesToolbar'
import { ImportFromCarrierDialog } from './ImportFromCarrierDialog'
import { FromHistoryDialog } from './FromHistoryDialog'
import { TRANSPORT_MODE_OPTIONS, CONTAINER_OPTIONS } from '../lib/chip-options'

type ExtractionResult = {
  extraction: {
    companyName?: string | null
    contactPerson?: string | null
    senderEmail?: string | null
    direction?: string | null
    summary?: string | null
    confidence?: number
    items: Array<{
      containerType?: string | null
      containerCount?: number | null
      origin?: string | null
      destination?: string | null
      cargoDescription?: string | null
      weightKg?: number | null
      readinessDate?: string | null
      incoterm?: string | null
      transportMode?: string | null
      notes?: string | null
    }>
    highlights: Array<{
      start: number
      end: number
      type: string
      label: string
    }>
  }
  model: string
  tokens: number
}

type ProductItem = {
  id: string
  name: string
  chargeCode?: string | null
  chargeUnit?: string | null
}

type LocationItem = {
  id: string
  name: string
  code?: string | null
}

type EditableItem = {
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
  weightKg: number | null
  readinessDate: string | null
  incoterm: string | null
  transportMode: string | null
  notes: string | null
}

type RfqCreationWizardProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (rfq: Record<string, unknown>) => void
}

// Resolve a location name to a real location record
async function resolveLocation(name: string): Promise<{ id: string; name: string } | null> {
  if (!name) return null
  const params = new URLSearchParams({ q: name, limit: '5' })
  const res = await apiCall<{ items?: LocationItem[] }>(`/api/fms_locations/locations?${params}`)
  const items = res.result?.items || []
  if (items.length === 0) return null
  // Prefer exact name match (case-insensitive), otherwise first result
  const exact = items.find((loc) => loc.name.toLowerCase() === name.toLowerCase())
  return exact ? { id: exact.id, name: exact.name } : { id: items[0].id, name: items[0].name }
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '8px',
}

export function RfqCreationWizard({ open, onOpenChange, onCreated }: RfqCreationWizardProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [rawText, setRawText] = useState('')
  const [rfqId, setRfqId] = useState<string | null>(null)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set())
  const [calculations, setCalculations] = useState<Array<{ chargeRows: ChargeRow[] }>>([])
  const [editableItems, setEditableItems] = useState<EditableItem[]>([])
  const [editingItems, setEditingItems] = useState<Set<number>>(new Set())
  const [expandedPol, setExpandedPol] = useState<Set<number>>(new Set())
  const [expandedPod, setExpandedPod] = useState<Set<number>>(new Set())
  const [importDialogItem, setImportDialogItem] = useState<number | null>(null)
  const [historyDialogItem, setHistoryDialogItem] = useState<number | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const handleReset = useCallback(() => {
    setStep(0)
    setRawText('')
    setRfqId(null)
    setExtraction(null)
    setExtracting(false)
    setCreating(false)
    setExpandedBoxes(new Set())
    setCalculations([])
    setEditableItems([])
    setEditingItems(new Set())
    setExpandedPol(new Set())
    setExpandedPod(new Set())
    setImportDialogItem(null)
    setHistoryDialogItem(null)
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) handleReset()
      onOpenChange(nextOpen)
    },
    [onOpenChange, handleReset],
  )

  // Fetch products once we know transportMode
  const transportMode = editableItems.find((item) => item.transportMode)?.transportMode
    || extraction?.extraction.items?.[0]?.transportMode || null
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

  // Populate charge rows when products load
  useEffect(() => {
    if (!products || products.length === 0 || editableItems.length === 0) return
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
    setCalculations((prev) => {
      if (prev.length === 0) return prev
      return prev.map((calc) =>
        calc.chargeRows.length > 0 ? calc : { ...calc, chargeRows: defaultRows.map((r) => ({ ...r, id: `${r.id}-${Math.random()}` })) },
      )
    })
  }, [products, editableItems.length])

  // Auto-resolve extracted location names to real location IDs
  const resolveLocationsForItems = useCallback(async (items: EditableItem[]) => {
    // Collect unique location names to resolve
    const namesToResolve = new Set<string>()
    for (const item of items) {
      if (item.origin) namesToResolve.add(item.origin)
      if (item.destination) namesToResolve.add(item.destination)
    }

    if (namesToResolve.size === 0) return

    // Resolve all in parallel
    const resolved = new Map<string, { id: string; name: string }>()
    await Promise.all(
      Array.from(namesToResolve).map(async (name) => {
        const loc = await resolveLocation(name)
        if (loc) resolved.set(name, loc)
      }),
    )

    if (!mountedRef.current || resolved.size === 0) return

    // Apply resolved IDs to items
    setEditableItems((prev) =>
      prev.map((item) => {
        const updates: Partial<EditableItem> = {}
        if (item.origin && resolved.has(item.origin)) {
          const loc = resolved.get(item.origin)!
          updates.originLocationId = loc.id
          updates.origin = loc.name
        }
        if (item.destination && resolved.has(item.destination)) {
          const loc = resolved.get(item.destination)!
          updates.destinationLocationId = loc.id
          updates.destination = loc.name
        }
        return Object.keys(updates).length > 0 ? { ...item, ...updates } : item
      }),
    )
  }, [])

  const handleCreate = useCallback(async (text: string) => {
    setRawText(text)
    setCreating(true)

    try {
      // 1. Create RFQ immediately with just rawText
      const rfqRes = await apiCall<{ id: string }>('/api/fms_offers/rfq', {
        method: 'POST',
        body: JSON.stringify({ rawText: text }),
        headers: { 'Content-Type': 'application/json' },
      })

      if (!rfqRes.ok || !rfqRes.result?.id) {
        console.error('[RfqCreationWizard] Failed to create RFQ')
        setCreating(false)
        return
      }

      const newRfqId = rfqRes.result.id
      if (!mountedRef.current) return
      setRfqId(newRfqId)
      setStep(1)
      setCreating(false)

      // 2. Fire extraction in background
      setExtracting(true)
      try {
        const extractRes = await apiCall<ExtractionResult>('/api/fms_offers/rfq/extract', {
          method: 'POST',
          body: JSON.stringify({ text }),
          headers: { 'Content-Type': 'application/json' },
        })

        if (!mountedRef.current) return

        if (extractRes.ok && extractRes.result) {
          const result = extractRes.result
          setExtraction(result)

          // Initialize editable items from extraction
          const newItems: EditableItem[] = result.extraction.items.map((item) => ({
            containerType: item.containerType || null,
            containerCount: item.containerCount || null,
            origin: item.origin || null,
            originLocationId: null,
            destination: item.destination || null,
            destinationLocationId: null,
            placeOfLoading: null,
            placeOfLoadingId: null,
            placeOfDelivery: null,
            placeOfDeliveryId: null,
            cargoDescription: item.cargoDescription || null,
            weightKg: item.weightKg || null,
            readinessDate: item.readinessDate || null,
            incoterm: item.incoterm || null,
            transportMode: item.transportMode || null,
            notes: item.notes || null,
          }))
          setEditableItems(newItems)

          // Initialize calculation state for each extracted item
          const itemCalcs = result.extraction.items.map(() => ({
            chargeRows: [] as ChargeRow[],
          }))
          setCalculations(itemCalcs.length > 0 ? itemCalcs : [{ chargeRows: [] }])
          // Expand all boxes by default
          setExpandedBoxes(new Set(result.extraction.items.map((_, i) => i)))

          // Auto-resolve location names to real records
          resolveLocationsForItems(newItems)

          // 3. Update the RFQ with extracted data + items
          const ext = result.extraction
          await apiCall(`/api/fms_offers/rfq/${newRfqId}`, {
            method: 'PUT',
            body: JSON.stringify({
              title: ext.summary || null,
              companyName: ext.companyName || null,
              contactPerson: ext.contactPerson || null,
              senderEmail: ext.senderEmail || null,
              senderName: ext.contactPerson || null,
              extractedData: ext,
              highlights: ext.highlights || null,
              direction: ext.direction || null,
              transportMode: ext.items?.[0]?.transportMode || null,
              origin: ext.items?.[0]?.origin || null,
              destination: ext.items?.[0]?.destination || null,
              items: ext.items?.map((item, idx) => ({
                itemNumber: idx + 1,
                containerType: item.containerType || null,
                containerCount: item.containerCount || null,
                origin: item.origin || null,
                destination: item.destination || null,
                cargoDescription: item.cargoDescription || null,
                weightKg: item.weightKg || null,
                readinessDate: item.readinessDate || null,
                incoterm: item.incoterm || null,
                transportMode: item.transportMode || null,
                notes: item.notes || null,
              })),
            }),
            headers: { 'Content-Type': 'application/json' },
          })
        }
      } catch (err) {
        console.error('[RfqCreationWizard] extraction error:', err)
      } finally {
        if (mountedRef.current) setExtracting(false)
      }
    } catch (error) {
      console.error('[RfqCreationWizard] Error:', error)
      if (mountedRef.current) setCreating(false)
    }
  }, [resolveLocationsForItems])

  const updateCalculation = useCallback((index: number, chargeRows: ChargeRow[]) => {
    setCalculations((prev) =>
      prev.map((calc, i) => (i === index ? { ...calc, chargeRows } : calc)),
    )
  }, [])

  const updateItem = useCallback((index: number, patch: Partial<EditableItem>) => {
    setEditableItems((prev) =>
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

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="p-0 flex flex-col"
        style={{ width: step === 0 ? '55vw' : '85vw', maxWidth: step === 0 ? '800px' : '1400px', minWidth: '640px', transition: 'width 0.3s ease' }}
        hideCloseButton
        ariaTitle="Create RFQ from Email"
        overlayClassName="backdrop-blur-none"
      >
        <div className="flex flex-col h-full">
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
            <RfqWizardStepper activeStep={step} onStepClick={setStep} />
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none ml-3 flex-shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {/* Step 0: Text Input */}
            {step === 0 && (
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <RfqTextInput onCreate={handleCreate} submitting={creating} initialText={rawText} />
              </div>
            )}

            {/* Step 1: Pricing (split layout) */}
            {step === 1 && (
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left: Collapsible calculation boxes */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px 24px',
                    borderRight: '1px solid var(--border)',
                  }}
                >
                  {extracting ? (
                    /* Skeleton loading boxes */
                    <>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            padding: '16px 20px',
                            marginBottom: '12px',
                            animation: 'pulse 1.5s ease-in-out infinite',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: 28, height: 20, borderRadius: '9999px', background: 'var(--muted)' }} />
                            <div style={{ width: 60, height: 16, borderRadius: '6px', background: 'var(--muted)' }} />
                            <div style={{ flex: 1, height: 16, borderRadius: '6px', background: 'var(--muted)', maxWidth: '200px' }} />
                          </div>
                          {i === 0 && (
                            <div style={{ marginTop: '16px' }}>
                              <div style={{ width: '100%', height: 120, borderRadius: '8px', background: 'var(--muted)', opacity: 0.5 }} />
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{ textAlign: 'center', padding: '8px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
                        {t('tasks_board.wizard.extracting', 'Analyzing content...')}
                      </div>
                    </>
                  ) : (
                    editableItems.map((item, idx) => {
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
                            {/* Chevron + number */}
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

                          {/* Expandable edit panel */}
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

                              {/* Transport Mode + Container Type */}
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

                              {/* Location row: [POL] [Origin] [Swap] [Destination] [POD] */}
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

                          {/* Expanded content */}
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
                    })
                  )}

                  {!extracting && editableItems.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
                      {t('tasks_board.wizard.extracting', 'Analyzing content...')}
                    </div>
                  )}
                </div>

                {/* Right: Highlighted text */}
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
                    {t('tasks_board.wizard.originalMessage', 'Original Message')}
                  </div>
                  {extracting ? (
                    /* Skeleton for highlighted text */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {[100, 80, 90, 70, 60, 85, 75].map((w, i) => (
                        <div
                          key={i}
                          style={{
                            width: `${w}%`,
                            height: 14,
                            borderRadius: '6px',
                            background: 'var(--muted)',
                            animation: 'pulse 1.5s ease-in-out infinite',
                            animationDelay: `${i * 0.1}s`,
                          }}
                        />
                      ))}
                    </div>
                  ) : extraction ? (
                    <HighlightedText
                      text={rawText}
                      highlights={extraction.extraction.highlights}
                      senderEmail={extraction.extraction.senderEmail}
                      senderName={extraction.extraction.contactPerson}
                      companyName={extraction.extraction.companyName}
                    />
                  ) : (
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
                      {rawText}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Preview */}
            {step === 2 && (
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <div
                  style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--muted-foreground)',
                    fontSize: '14px',
                  }}
                >
                  {t('tasks_board.wizard.previewComingSoon', 'Preview step coming soon. Use the button below to create the RFQ and offer.')}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {step > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 24px',
                borderTop: '1px solid var(--border)',
                flexShrink: 0,
                background: 'var(--card)',
              }}
            >
              <div>
                <Button
                  variant="ghost"
                  onClick={() => setStep((s) => s - 1)}
                  style={{ gap: '4px' }}
                >
                  <ArrowLeft style={{ width: 14, height: 14 }} />
                  {t('tasks_board.wizard.back', 'Back')}
                </Button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {step === 1 && (
                  <Button
                    onClick={() => setStep(2)}
                    style={{ gap: '4px' }}
                  >
                    {t('tasks_board.wizard.next', 'Next')}
                    <ArrowRight style={{ width: 14, height: 14 }} />
                  </Button>
                )}
                {step === 2 && (
                  <Button style={{ gap: '4px' }} disabled>
                    <Send style={{ width: 14, height: 14 }} />
                    {t('tasks_board.wizard.send', 'Send')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </SheetContent>
    </Sheet>
  )
}
