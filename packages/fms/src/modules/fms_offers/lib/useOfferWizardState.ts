import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ChargeRow } from '../../tasks_board/components/ChargesTable'
import { FMS_CHARGE_UNITS } from '../data/types'
import {
  type WizardItem,
  type ProductItem,
  makeEmptyItem,
  offerLineToChargeRow,
  resolveLocation,
} from '../../tasks_board/lib/wizard-types'

type UseOfferWizardStateInput = {
  open: boolean
}

export function useOfferWizardState({ open }: UseOfferWizardStateInput) {
  const queryClient = useQueryClient()
  const mountedRef = useRef(true)
  const draftCreatingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Core state — start at step 1 (pricing) directly, no step 0
  const [step, setStep] = useState(1)
  const [offerType, setOfferType] = useState<'sell' | 'buy'>('sell')
  const [contractorId, setContractorId] = useState<string | null>(null)
  const [contractorName, setContractorName] = useState<string | null>(null)
  const [carrierId, setCarrierId] = useState<string | null>(null)
  const [carrierName, setCarrierName] = useState<string | null>(null)
  const [validUntil, setValidUntil] = useState<string>(() => {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date.toISOString()
  })
  const [direction, setDirection] = useState<string | null>(null)
  const [transportMode, setTransportMode] = useState<string | null>(null)
  const [cargoType, setCargoType] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Items & calculations
  const [editableItems, setEditableItems] = useState<WizardItem[]>([makeEmptyItem()])
  const [calculations, setCalculations] = useState<Array<{ chargeRows: ChargeRow[] }>>([{ chargeRows: [] }])

  // Draft offer tracking
  const [offerId, setOfferId] = useState<string | null>(null)
  const [calculationIds, setCalculationIds] = useState<string[]>([])

  // Special terms (custom conditions for PDF)
  const [specialTerms, setSpecialTerms] = useState('')

  // UI state
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set([0]))
  const [editingItems, setEditingItems] = useState<Set<number>>(new Set())
  const [expandedPol, setExpandedPol] = useState<Set<number>>(new Set())
  const [expandedPod, setExpandedPod] = useState<Set<number>>(new Set())
  const [importDialogItem, setImportDialogItem] = useState<number | null>(null)
  const [historyDialogItem, setHistoryDialogItem] = useState<number | null>(null)

  // Initialize empty calculations when items change
  useEffect(() => {
    if (editableItems.length === 0) return
    setCalculations((prev) => {
      if (prev.length >= editableItems.length) return prev
      const extended = [...prev]
      while (extended.length < editableItems.length) {
        extended.push({ chargeRows: [] })
      }
      return extended
    })
  }, [editableItems.length])

  // Fetch products by transportMode
  const itemTransportMode = editableItems.find((item) => item.transportMode)?.transportMode || null
  const effectiveTransportMode = transportMode || itemTransportMode
  const { data: products } = useQuery({
    queryKey: ['fms-products-for-offer', effectiveTransportMode],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (effectiveTransportMode) params.set('transportMode', effectiveTransportMode)
      const res = await apiCall<{ items: ProductItem[] }>(`/api/fms_products/products?${params}`)
      return res.result?.items || []
    },
    enabled: !!effectiveTransportMode,
  })

  // Track calculations in a ref to avoid infinite loops in effects
  const calculationsRef = useRef(calculations)
  calculationsRef.current = calculations

  // Populate default charge rows from products when no rows exist
  useEffect(() => {
    if (!products || products.length === 0 || editableItems.length === 0) return
    const current = calculationsRef.current
    if (offerId && current.some((c) => c.chargeRows.length > 0 && !c.chargeRows[0].id.startsWith('new-'))) return
    if (current.every((c) => c.chargeRows.length > 0)) return
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
      quantity: 1,
      isEnabled: true,
    }))
    setCalculations((prev) => {
      if (prev.length === 0) return prev
      return prev.map((calc) =>
        calc.chargeRows.length > 0 ? calc : { ...calc, chargeRows: defaultRows.map((r) => ({ ...r, id: `${r.id}-${Math.random()}` })) },
      )
    })
  }, [products, editableItems.length, offerId])

  // Refs for ensureDraftOffer to avoid recreating the callback
  const offerIdRef = useRef(offerId)
  offerIdRef.current = offerId
  const editableItemsRef = useRef(editableItems)
  editableItemsRef.current = editableItems
  const offerTypeRef = useRef(offerType)
  offerTypeRef.current = offerType
  const contractorIdRef = useRef(contractorId)
  contractorIdRef.current = contractorId
  const carrierIdRef = useRef(carrierId)
  carrierIdRef.current = carrierId
  const validUntilRef = useRef(validUntil)
  validUntilRef.current = validUntil
  const directionRef = useRef(direction)
  directionRef.current = direction
  const transportModeRef = useRef(transportMode)
  transportModeRef.current = transportMode
  const cargoTypeRef = useRef(cargoType)
  cargoTypeRef.current = cargoType

  // Ensure draft offer exists (called on Step 1 entry)
  // Creates one calculation per editable item (route)
  const ensureDraftOffer = useCallback(async () => {
    if (offerIdRef.current || draftCreatingRef.current) return
    draftCreatingRef.current = true
    try {
      const firstItem = editableItemsRef.current[0]
      const offerRes = await apiCall<{ id: string; calculations?: Array<{ id: string }> }>('/api/fms_offers/offers', {
        method: 'POST',
        body: JSON.stringify({
          type: offerTypeRef.current,
          rfqId: null,
          contractorId: contractorIdRef.current,
          carrierId: carrierIdRef.current,
          validUntil: validUntilRef.current,
          direction: directionRef.current,
          transportMode: transportModeRef.current || firstItem?.transportMode || null,
          cargoType: cargoTypeRef.current,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!offerRes.ok) return
      const offer = offerRes.result
      if (offer?.id && mountedRef.current) {
        setOfferId(offer.id)
        offerIdRef.current = offer.id
        const newCalcIds: string[] = []
        const firstCalcId = offer.calculations?.[0]?.id
        if (firstCalcId) newCalcIds.push(firstCalcId)

        // Create additional calculations for extra routes
        const items = editableItemsRef.current
        for (let i = 1; i < items.length; i++) {
          const item = items[i]
          const calcRes = await apiCall<{ id: string }>('/api/fms_offers/calculations', {
            method: 'POST',
            body: JSON.stringify({
              offerId: offer.id,
              label: `Route ${i + 1}`,
              originLocationId: item.originLocationId || null,
              destinationLocationId: item.destinationLocationId || null,
              placeOfLoadingId: item.placeOfLoadingId || null,
              placeOfDeliveryId: item.placeOfDeliveryId || null,
            }),
            headers: { 'Content-Type': 'application/json' },
          })
          if (calcRes.ok && calcRes.result?.id) {
            newCalcIds.push(calcRes.result.id)
          }
        }

        if (mountedRef.current) {
          setCalculationIds(newCalcIds)
          calculationIdsRef.current = newCalcIds
        }
      }
    } finally {
      draftCreatingRef.current = false
    }
  }, [])

  // Auto-create draft offer when on pricing step with no offerId
  useEffect(() => {
    if (step >= 1 && !offerId && !draftCreatingRef.current && editableItems.length > 0) {
      ensureDraftOffer()
    }
  }, [step, offerId, ensureDraftOffer, editableItems.length])

  // Sync charge row changes to server (debounced)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSyncRef = useRef<{ index: number; rows: ChargeRow[] } | null>(null)
  const calculationIdsRef = useRef(calculationIds)
  calculationIdsRef.current = calculationIds

  // Track client-side IDs that were deleted before being synced to server
  const deletedClientIdsRef = useRef(new Set<string>())

  // Core sync logic — sends charge rows for a specific item index to the server
  const executeSyncForIndex = useCallback(async (index: number, rows: ChargeRow[]) => {
    const calcId = calculationIdsRef.current[index]
    if (!calcId) return
    for (const row of rows) {
      const isNew = row.id.startsWith('new-')
      const lineData = {
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
        isEnabled: row.isEnabled,
      }
      if (isNew) {
        if (deletedClientIdsRef.current.has(row.id)) continue
        const res = await apiCall<{ id: string }>('/api/fms_offers/offer-lines', {
          method: 'POST',
          body: JSON.stringify(lineData),
          headers: { 'Content-Type': 'application/json' },
        })
        if (res.ok && res.result?.id) {
          setCalculations((prev) =>
            prev.map((calc, i) =>
              i === index
                ? { ...calc, chargeRows: calc.chargeRows.map((r) => r.id === row.id ? { ...r, id: res.result!.id } : r) }
                : calc,
            ),
          )
        }
      } else {
        await apiCall(`/api/fms_offers/offer-lines/${row.id}`, {
          method: 'PUT',
          body: JSON.stringify(lineData),
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
  }, [])

  const syncChargeRow = useCallback((index: number, rows: ChargeRow[]) => {
    setCalculations((prev) =>
      prev.map((calc, i) => (i === index ? { ...calc, chargeRows: rows } : calc)),
    )

    pendingSyncRef.current = { index, rows }
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      const pending = pendingSyncRef.current
      if (!pending) return
      pendingSyncRef.current = null
      await executeSyncForIndex(pending.index, pending.rows)
    }, 500)
  }, [executeSyncForIndex])

  // Queue for edits made before calculationIds are ready
  const pendingLocalEditsRef = useRef<Map<number, ChargeRow[]>>(new Map())

  // Flush any pending debounced sync immediately — returns when sync is complete
  const flushPendingSync = useCallback(async () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    pendingSyncRef.current = null

    if (pendingLocalEditsRef.current.size > 0) {
      const calcIds = calculationIdsRef.current
      for (const [index, rows] of pendingLocalEditsRef.current) {
        if (calcIds[index]) {
          await executeSyncForIndex(index, rows)
        }
      }
      pendingLocalEditsRef.current.clear()
    }

    const calcs = calculationsRef.current
    const calcIds = calculationIdsRef.current
    for (let i = 0; i < calcs.length; i++) {
      if (!calcIds[i] || calcs[i].chargeRows.length === 0) continue
      await executeSyncForIndex(i, calcs[i].chargeRows)
    }
  }, [executeSyncForIndex])

  // Delete a charge row from server
  const deleteChargeRow = useCallback(async (rowId: string) => {
    if (rowId.startsWith('new-')) {
      deletedClientIdsRef.current.add(rowId)
    } else {
      await apiCall(`/api/fms_offers/offer-lines/${rowId}`, { method: 'DELETE' })
    }
  }, [])

  const updateCalculation = useCallback((index: number, chargeRows: ChargeRow[]) => {
    const prev = calculationsRef.current[index]?.chargeRows || []
    const newIds = new Set(chargeRows.map((r) => r.id))
    for (const row of prev) {
      if (!newIds.has(row.id)) deleteChargeRow(row.id)
    }

    if (offerId && calculationIdsRef.current[index]) {
      syncChargeRow(index, chargeRows)
    } else {
      pendingLocalEditsRef.current.set(index, chargeRows)
      setCalculations((p) =>
        p.map((calc, i) => (i === index ? { ...calc, chargeRows } : calc)),
      )
    }
  }, [offerId, syncChargeRow, deleteChargeRow])

  // Flush queued edits when calculationIds become available
  useEffect(() => {
    if (calculationIds.length === 0 || pendingLocalEditsRef.current.size === 0) return
    for (const [index, rows] of pendingLocalEditsRef.current) {
      if (calculationIds[index]) {
        executeSyncForIndex(index, rows)
      }
    }
    pendingLocalEditsRef.current.clear()
  }, [calculationIds, executeSyncForIndex])

  const updateItem = useCallback((index: number, patch: Partial<WizardItem>) => {
    setEditableItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )

    // Auto-resolve location names → IDs when origin/destination name is set without an ID
    const shouldResolveOrigin = patch.origin && !patch.originLocationId
    const shouldResolveDest = patch.destination && !patch.destinationLocationId
    if (shouldResolveOrigin || shouldResolveDest) {
      ;(async () => {
        const updates: Partial<WizardItem> = {}
        if (shouldResolveOrigin) {
          const loc = await resolveLocation(patch.origin!)
          if (loc) { updates.originLocationId = loc.id; updates.origin = loc.name }
        }
        if (shouldResolveDest) {
          const loc = await resolveLocation(patch.destination!)
          if (loc) { updates.destinationLocationId = loc.id; updates.destination = loc.name }
        }
        if (Object.keys(updates).length > 0 && mountedRef.current) {
          setEditableItems((prev) =>
            prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
          )
        }
      })()
    }
  }, [])

  const toggleEditing = useCallback((idx: number) => {
    setEditingItems((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleAddItem = useCallback(async () => {
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
    const newIndex = editableItems.length
    setEditableItems((prev) => [...prev, makeEmptyItem()])
    setCalculations((prev) => [...prev, { chargeRows: defaultRows }])
    setExpandedBoxes((prev) => {
      const next = new Set(prev)
      next.add(newIndex)
      return next
    })
    setEditingItems((prev) => {
      const next = new Set(prev)
      next.add(newIndex)
      return next
    })

    // Create server-side calculation for the new item
    const oid = offerIdRef.current
    if (oid) {
      const calcRes = await apiCall<{ id: string }>('/api/fms_offers/calculations', {
        method: 'POST',
        body: JSON.stringify({
          offerId: oid,
          label: `Route ${newIndex + 1}`,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (calcRes.ok && calcRes.result?.id && mountedRef.current) {
        setCalculationIds((prev) => [...prev, calcRes.result!.id])
      }
    }
  }, [products, editableItems.length])

  const handleRemoveItem = useCallback(async (index: number) => {
    const removedRows = calculationsRef.current[index]?.chargeRows || []
    for (const row of removedRows) {
      deleteChargeRow(row.id)
    }

    const calcId = calculationIdsRef.current[index]
    if (calcId) {
      apiCall(`/api/fms_offers/calculations/${calcId}`, { method: 'DELETE' }).catch(() => {})
    }

    setEditableItems((prev) => prev.filter((_, i) => i !== index))
    setCalculations((prev) => prev.filter((_, i) => i !== index))
    setCalculationIds((prev) => prev.filter((_, i) => i !== index))

    const reindex = (prev: Set<number>) => {
      const next = new Set<number>()
      for (const idx of prev) {
        if (idx < index) next.add(idx)
        else if (idx > index) next.add(idx - 1)
      }
      return next
    }
    setExpandedBoxes(reindex)
    setEditingItems(reindex)
    setExpandedPol(reindex)
    setExpandedPod(reindex)
  }, [deleteChargeRow])

  // Contractor persistence — sync to draft offer when changed
  const handleContractorChange = useCallback((id: string | null, name?: string) => {
    setContractorId(id)
    setContractorName(name ?? null)
    const oid = offerIdRef.current
    if (!oid) return
    apiCall(`/api/fms_offers/offers/${oid}`, {
      method: 'PUT',
      body: JSON.stringify({ contractorId: id }),
      headers: { 'Content-Type': 'application/json' },
    })
  }, [])

  // Special terms persistence (debounced)
  const specialTermsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateSpecialTerms = useCallback((text: string) => {
    setSpecialTerms(text)
    if (specialTermsTimerRef.current) clearTimeout(specialTermsTimerRef.current)
    specialTermsTimerRef.current = setTimeout(async () => {
      const oid = offerIdRef.current
      if (!oid) return
      await apiCall(`/api/fms_offers/offers/${oid}`, {
        method: 'PUT',
        body: JSON.stringify({ specialTerms: text || null }),
        headers: { 'Content-Type': 'application/json' },
      })
    }, 500)
  }, [])

  // Send offer
  const handleSend = useCallback(async () => {
    if (!offerId || sending) return
    setSending(true)
    try {
      await flushPendingSync()

      await apiCall(`/api/fms_offers/offers/${offerId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'sent' }),
        headers: { 'Content-Type': 'application/json' },
      })

      queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
    } finally {
      if (mountedRef.current) setSending(false)
    }
  }, [offerId, sending, queryClient, flushPendingSync])

  // Reset all state
  const reset = useCallback(() => {
    setStep(1)
    setOfferType('sell')
    setContractorId(null)
    setContractorName(null)
    setCarrierId(null)
    setCarrierName(null)
    const date = new Date()
    date.setDate(date.getDate() + 30)
    setValidUntil(date.toISOString())
    setDirection(null)
    setTransportMode(null)
    setCargoType(null)
    setSending(false)
    setSpecialTerms('')
    setEditableItems([makeEmptyItem()])
    setCalculations([{ chargeRows: [] }])
    setOfferId(null)
    setCalculationIds([])
    setExpandedBoxes(new Set([0]))
    setEditingItems(new Set())
    setExpandedPol(new Set())
    setExpandedPod(new Set())
    setImportDialogItem(null)
    setHistoryDialogItem(null)
    draftCreatingRef.current = false
  }, [])

  return {
    // Core state
    step,
    setStep,
    offerType,
    setOfferType,
    contractorId,
    contractorName,
    handleContractorChange,
    carrierId,
    setCarrierId,
    carrierName,
    setCarrierName,
    validUntil,
    setValidUntil,
    direction,
    setDirection,
    transportMode,
    setTransportMode,
    cargoType,
    setCargoType,
    sending,

    // Items & calculations
    editableItems,
    calculations,
    products,

    // Draft offer
    offerId,
    calculationIds,
    specialTerms,
    updateSpecialTerms,

    // UI state
    expandedBoxes,
    setExpandedBoxes,
    editingItems,
    expandedPol,
    setExpandedPol,
    expandedPod,
    setExpandedPod,
    importDialogItem,
    setImportDialogItem,
    historyDialogItem,
    setHistoryDialogItem,

    // Actions
    ensureDraftOffer,
    updateCalculation,
    updateItem,
    toggleEditing,
    handleAddItem,
    handleRemoveItem,
    handleSend,
    flushPendingSync,
    reset,
  }
}
