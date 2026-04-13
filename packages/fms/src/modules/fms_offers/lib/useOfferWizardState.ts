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
  /** When provided, loads an existing offer instead of creating a new draft */
  existingOfferId?: string | null
}

export function useOfferWizardState({ open, existingOfferId }: UseOfferWizardStateInput) {
  const queryClient = useQueryClient()
  const mountedRef = useRef(true)
  const draftCreatingRef = useRef(false)
  const isEditMode = !!existingOfferId
  const existingOfferLoadedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Core state — start at step 1 (pricing) directly, no step 0
  const [step, setStep] = useState(1)
  const [offerType, setOfferType] = useState<'sell' | 'buy'>('sell')
  const [offerStatus, setOfferStatus] = useState<string>('draft')
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
  const [offerNumber, setOfferNumber] = useState<string | null>(null)
  const [calculationIds, setCalculationIds] = useState<string[]>([])

  // Multi-offer tabs
  type OfferTab = { offerId: string; label: string; offerNumber: string }
  const [offerTabs, setOfferTabs] = useState<OfferTab[]>([])
  const [activeOfferTabIndex, setActiveOfferTabIndex] = useState(0)
  const offerTabsRef = useRef<OfferTab[]>([])
  offerTabsRef.current = offerTabs
  const activeOfferTabIndexRef = useRef(0)
  activeOfferTabIndexRef.current = activeOfferTabIndex
  const deletedOfferIdsRef = useRef<Set<string>>(new Set())

  // Special terms (custom conditions for PDF)
  const [specialTerms, setSpecialTerms] = useState('')

  // UI state
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set([0]))
  const [editingItems, setEditingItems] = useState<Set<number>>(new Set())
  const [expandedPol, setExpandedPol] = useState<Set<number>>(new Set())
  const [expandedPod, setExpandedPod] = useState<Set<number>>(new Set())
  const [importDialogItem, setImportDialogItem] = useState<number | null>(null)
  const [historyDialogItem, setHistoryDialogItem] = useState<number | null>(null)

  // Load existing offer data (edit mode)
  useEffect(() => {
    if (!open || !existingOfferId || existingOfferLoadedRef.current) return
    existingOfferLoadedRef.current = true
    ;(async () => {
      const res = await apiCall<Record<string, any>>(`/api/fms_offers/offers/${existingOfferId}`)
      if (!res.ok || !res.result || !mountedRef.current) return
      const offer = res.result

      setOfferId(offer.id)
      offerIdRef.current = offer.id
      setOfferNumber(offer.offerNumber || null)
      setOfferType(offer.type || 'sell')
      setOfferStatus(offer.status || 'draft')
      // Initialize first offer tab from existing offer
      const existingTab: OfferTab = { offerId: offer.id, label: (offer as any).offerLabel || 'Offer #1', offerNumber: offer.offerNumber || '' }
      setOfferTabs([existingTab])
      offerTabsRef.current = [existingTab]
      setActiveOfferTabIndex(0)
      activeOfferTabIndexRef.current = 0
      setContractorId(offer.contractorId || null)
      // Resolve contractor name
      if (offer.contractorId) {
        const cRes = await apiCall<{ id: string; name: string }>(`/api/contractors/contractors/${offer.contractorId}`)
        if (cRes.ok && cRes.result?.name && mountedRef.current) {
          setContractorName(cRes.result.name)
        }
      }
      setDirection(offer.direction || null)
      setTransportMode(offer.transportMode || null)
      setCargoType(offer.cargoType || null)
      if (offer.validUntil) setValidUntil(offer.validUntil)
      setSpecialTerms(offer.specialTerms || '')

      // Build editable items from calculations
      // Filter out soft-deleted calculations to avoid ghost items
      const serverCalcs = (offer.calculations || []).filter(
        (c: any) => !c.deletedAt,
      ).sort(
        (a: any, b: any) => (a.calculationNumber ?? 0) - (b.calculationNumber ?? 0),
      )

      // Separate section calcs (main_freight/origin/destination for item 0) from route calcs (extra items)
      const SECTION_TYPES = new Set(['main_freight', 'origin', 'destination'])
      const mainCalc = serverCalcs.find((c: any) => c.sectionType === 'main_freight' || c.label === 'Main Freight') || serverCalcs[0]
      const routeCalcs = serverCalcs.filter((c: any) => !SECTION_TYPES.has(c.sectionType) && c.id !== mainCalc?.id)

      if (!mainCalc) return

      // Build items: first item from main calc + offer fields, additional items from route calcs
      const allItems: WizardItem[] = []
      const allCalcIds: string[] = []
      const allChargeRows: Array<{ chargeRows: ChargeRow[] }> = []

      // Item 0: main route
      allItems.push({
        containerType: mainCalc.containers?.[0] || null,
        containerCount: mainCalc.containers?.length || null,
        origin: null,
        originLocationId: mainCalc.originLocationId || null,
        destination: null,
        destinationLocationId: mainCalc.destinationLocationId || null,
        placeOfLoading: null,
        placeOfLoadingId: mainCalc.placeOfLoadingId || null,
        placeOfDelivery: null,
        placeOfDeliveryId: mainCalc.placeOfDeliveryId || null,
        cargoDescription: offer.customerNotes || null,
        weightKg: null,
        readinessDate: null,
        incoterm: offer.incoterm || null,
        transportMode: offer.transportMode || null,
        notes: null,
        carrierIds: offer.carrierIds || [],
        carrierNames: [],
        providerIds: offer.providerIds || [],
        providerNames: [],
      })
      allCalcIds.push(mainCalc.id)
      allChargeRows.push({
        chargeRows: (mainCalc.lines || []).filter((l: any) => !l.deletedAt).map((l: any) => offerLineToChargeRow(l)),
      })

      // Additional items from route calcs
      for (const rc of routeCalcs) {
        allItems.push({
          containerType: rc.containers?.[0] || null,
          containerCount: rc.containers?.length || null,
          origin: null,
          originLocationId: rc.originLocationId || null,
          destination: null,
          destinationLocationId: rc.destinationLocationId || null,
          placeOfLoading: null,
          placeOfLoadingId: rc.placeOfLoadingId || null,
          placeOfDelivery: null,
          placeOfDeliveryId: rc.placeOfDeliveryId || null,
          cargoDescription: null,
          weightKg: null,
          readinessDate: null,
          incoterm: null,
          transportMode: null,
          notes: null,
          carrierIds: [],
          carrierNames: [],
          providerIds: [],
          providerNames: [],
        })
        allCalcIds.push(rc.id)
        allChargeRows.push({
          chargeRows: (rc.lines || []).filter((l: any) => !l.deletedAt).map((l: any) => offerLineToChargeRow(l)),
        })
      }

      setEditableItems(allItems)
      setCalculations(allChargeRows)
      setCalculationIds(allCalcIds)
      calculationIdsRef.current = allCalcIds
      setExpandedBoxes(new Set(allItems.map((_, i) => i)))

      // Resolve location names from IDs for all items
      const locationIdsToResolve = new Set<string>()
      for (const it of allItems) {
        if (it.originLocationId) locationIdsToResolve.add(it.originLocationId)
        if (it.destinationLocationId) locationIdsToResolve.add(it.destinationLocationId)
      }
      const locNameMap = new Map<string, string>()
      for (const locId of locationIdsToResolve) {
        const locRes = await apiCall<{ id: string; name: string }>(`/api/fms_locations/locations/${locId}`)
        if (locRes.ok && locRes.result?.name) locNameMap.set(locId, locRes.result.name)
      }
      if (locNameMap.size > 0 && mountedRef.current) {
        setEditableItems((prev) => prev.map((it) => ({
          ...it,
          origin: (it.originLocationId && locNameMap.get(it.originLocationId)) || it.origin,
          destination: (it.destinationLocationId && locNameMap.get(it.destinationLocationId)) || it.destination,
        })))
      }

      // Resolve carrier/provider names from IDs (offer-level, applied to item 0)
      const carrierIdsToResolve = offer.carrierIds || []
      const providerIdsToResolve = offer.providerIds || []
      if (carrierIdsToResolve.length > 0) {
        const names: string[] = []
        for (const cid of carrierIdsToResolve) {
          const cRes = await apiCall<{ id: string; name: string }>(`/api/fms_products/carriers/${cid}`)
          names.push(cRes.result?.name || cid)
        }
        if (mountedRef.current) {
          setEditableItems((prev) => prev.map((it, idx) => idx === 0 ? { ...it, carrierNames: names } : it))
        }
      }
      if (providerIdsToResolve.length > 0) {
        const names: string[] = []
        for (const pid of providerIdsToResolve) {
          const pRes = await apiCall<{ id: string; name: string }>(`/api/contractors/contractors/${pid}`)
          names.push(pRes.result?.name || pid)
        }
        if (mountedRef.current) {
          setEditableItems((prev) => prev.map((it, idx) => idx === 0 ? { ...it, providerNames: names } : it))
        }
      }
    })()
  }, [open, existingOfferId])

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
      sectionType: product.defaultSectionType || 'main_freight',
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
      const offerRes = await apiCall<{ id: string; offerNumber?: string; calculations?: Array<{ id: string; calculationNumber?: number; sectionType?: string }> }>('/api/fms_offers/offers', {
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
        // Server creates 3 section-based calculations per item (main_freight, origin, destination).
        // Use the main_freight one for line syncing — lines carry their own sectionType.
        const serverCalcs = (offer.calculations || []).sort(
          (a, b) => (a.calculationNumber ?? 0) - (b.calculationNumber ?? 0),
        )
        const mainCalcId = serverCalcs.find((c) => c.sectionType === 'main_freight')?.id || serverCalcs[0]?.id
        setOfferId(offer.id)
        offerIdRef.current = offer.id
        setOfferNumber(offer.offerNumber || null)
        // Initialize first offer tab
        const firstTab: OfferTab = { offerId: offer.id, label: 'Offer #1', offerNumber: offer.offerNumber || '' }
        setOfferTabs([firstTab])
        offerTabsRef.current = [firstTab]
        setActiveOfferTabIndex(0)
        activeOfferTabIndexRef.current = 0
        const newCalcIds: string[] = []
        if (mainCalcId) newCalcIds.push(mainCalcId)

        // Create additional calculations for extra routes (items beyond the first)
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

  // Auto-create draft offer when on pricing step with no offerId (skip in edit mode)
  useEffect(() => {
    if (!isEditMode && open && step >= 1 && !offerId && !draftCreatingRef.current && editableItems.length > 0) {
      ensureDraftOffer()
    }
  }, [open, step, offerId, ensureDraftOffer, editableItems.length])

  // Sync charge row changes to server (debounced)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSyncRef = useRef<{ index: number; rows: ChargeRow[] } | null>(null)
  const calculationIdsRef = useRef(calculationIds)
  calculationIdsRef.current = calculationIds

  // Track client-side IDs that were deleted before being synced to server
  const deletedClientIdsRef = useRef(new Set<string>())
  // Track client-side IDs currently being POSTed to prevent double-creation
  const inFlightPostIdsRef = useRef(new Set<string>())

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
        sectionType: row.sectionType || null,
      }
      if (isNew) {
        if (deletedClientIdsRef.current.has(row.id)) continue
        if (inFlightPostIdsRef.current.has(row.id)) continue
        inFlightPostIdsRef.current.add(row.id)
        const res = await apiCall<{ id: string }>('/api/fms_offers/offer-lines', {
          method: 'POST',
          body: JSON.stringify(lineData),
          headers: { 'Content-Type': 'application/json' },
        })
        inFlightPostIdsRef.current.delete(row.id)
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

  // Save all item-level fields to server (called on close, next, send)
  const saveAllItemFields = useCallback(async () => {
    const oid = offerIdRef.current
    if (!oid) return
    const items = editableItemsRef.current
    if (items.length === 0) return
    const calcIds = calculationIdsRef.current

    const firstItem = items[0]

    // Sync offer-level fields from items (carrier, provider, incoterm)
    const allCarrierIds = items.flatMap((item) => item.carrierIds || [])
    const allProviderIds = items.flatMap((item) => item.providerIds || [])
    const offerPayload = {
      carrierIds: allCarrierIds.length > 0 ? allCarrierIds : null,
      providerIds: allProviderIds.length > 0 ? allProviderIds : null,
      incoterm: firstItem?.incoterm || null,
      transportMode: firstItem?.transportMode || null,
      cargoType: null as string | null,
      customerNotes: firstItem?.cargoDescription || null,
    }
    await apiCall(`/api/fms_offers/offers/${oid}`, {
      method: 'PUT',
      body: JSON.stringify(offerPayload),
      headers: { 'Content-Type': 'application/json' },
    })

    // Sync calculation-level fields (locations) for each item
    for (let i = 0; i < items.length; i++) {
      const calcId = calcIds[i]
      if (!calcId) continue
      const item = items[i]
      await apiCall(`/api/fms_offers/calculations/${calcId}`, {
        method: 'PUT',
        body: JSON.stringify({
          originLocationId: item.originLocationId || null,
          destinationLocationId: item.destinationLocationId || null,
          placeOfLoadingId: item.placeOfLoadingId || null,
          placeOfDeliveryId: item.placeOfDeliveryId || null,
          containers: item.containerType ? [item.containerType] : null,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }, [])

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

    // Also save item-level fields (carrier, provider, incoterm, locations)
    await saveAllItemFields()
  }, [executeSyncForIndex, saveAllItemFields])

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
      sectionType: product.defaultSectionType || 'main_freight',
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

  // Create a new offer tab (parallel alternative)
  const createOfferTab = useCallback(async () => {
    const firstItem = editableItemsRef.current[0]
    const validUntilDate = new Date()
    validUntilDate.setDate(validUntilDate.getDate() + 30)

    // Flush pending changes for the current offer before creating a new one
    await flushPendingSync()

    const offerRes = await apiCall<{ id: string; offerNumber?: string; calculations?: Array<{ id: string }> }>('/api/fms_offers/offers', {
      method: 'POST',
      body: JSON.stringify({
        type: offerTypeRef.current,
        rfqId: null,
        contractorId: contractorIdRef.current,
        validUntil: validUntilDate.toISOString(),
        transportMode: transportModeRef.current || firstItem?.transportMode || null,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    if (!offerRes.ok || !offerRes.result) return

    const newOffer = offerRes.result
    const currentTabs = offerTabsRef.current
    const newTab: OfferTab = {
      offerId: newOffer.id,
      label: `Offer #${currentTabs.length + 1}`,
      offerNumber: newOffer.offerNumber || '',
    }
    setOfferTabs((prev) => [...prev, newTab])
    offerTabsRef.current = [...currentTabs, newTab]
    // Switch to the new tab
    const newIndex = currentTabs.length
    setActiveOfferTabIndex(newIndex)
    activeOfferTabIndexRef.current = newIndex
    // Update active offer
    setOfferId(newOffer.id)
    offerIdRef.current = newOffer.id
    setOfferNumber(newOffer.offerNumber || null)
    const calcIds = newOffer.calculations?.map((c) => c.id) || []
    setCalculationIds(calcIds)
    calculationIdsRef.current = calcIds
    // Clear per-offer tracking state and charge rows for new offer
    deletedClientIdsRef.current.clear()
    inFlightPostIdsRef.current.clear()
    pendingLocalEditsRef.current.clear()
    setCalculations(editableItemsRef.current.map(() => ({ chargeRows: [] })))
    queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
  }, [queryClient, flushPendingSync])

  // Delete an offer tab (not the first one)
  const deleteOfferTab = useCallback(async (tabIndex: number) => {
    if (tabIndex === 0) return
    const tabs = offerTabsRef.current
    const tab = tabs[tabIndex]
    if (!tab) return

    deletedOfferIdsRef.current.add(tab.offerId)

    try {
      await apiCall(`/api/fms_offers/offers/${tab.offerId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch { /* best-effort */ }

    const newTabs = tabs.filter((_, i) => i !== tabIndex)
    setOfferTabs(newTabs)
    offerTabsRef.current = newTabs

    const currentActive = activeOfferTabIndexRef.current
    if (currentActive >= tabIndex) {
      const newActive = Math.max(0, currentActive - 1)
      setActiveOfferTabIndex(newActive)
      activeOfferTabIndexRef.current = newActive
      const activeTab = newTabs[newActive]
      if (activeTab) {
        setOfferId(activeTab.offerId)
        offerIdRef.current = activeTab.offerId
        setOfferNumber(activeTab.offerNumber || null)
        const res = await apiCall<Record<string, any>>(`/api/fms_offers/offers/${activeTab.offerId}`)
        if (res.ok && res.result) {
          const calcs = (res.result.calculations || []).filter((c: any) => !c.deletedAt)
          setCalculationIds(calcs.map((c: any) => c.id))
          calculationIdsRef.current = calcs.map((c: any) => c.id)
          setCalculations(calcs.map((c: any) => ({
            chargeRows: (c.lines || []).filter((l: any) => !l.deletedAt).map((l: any) => offerLineToChargeRow(l)),
          })))
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
  }, [queryClient])

  // Switch active offer tab
  const switchOfferTab = useCallback(async (tabIndex: number) => {
    if (tabIndex === activeOfferTabIndexRef.current) return
    const tab = offerTabsRef.current[tabIndex]
    if (!tab) return

    await flushPendingSync()

    // Clear per-offer tracking state
    deletedClientIdsRef.current.clear()
    inFlightPostIdsRef.current.clear()
    pendingLocalEditsRef.current.clear()

    setActiveOfferTabIndex(tabIndex)
    activeOfferTabIndexRef.current = tabIndex
    setOfferId(tab.offerId)
    offerIdRef.current = tab.offerId
    setOfferNumber(tab.offerNumber || null)

    const res = await apiCall<Record<string, any>>(`/api/fms_offers/offers/${tab.offerId}`)
    if (!res.ok || !res.result) return
    const offer = res.result
    const calcs = (offer.calculations || []).filter((c: any) => !c.deletedAt).sort(
      (a: any, b: any) => (a.calculationNumber ?? 0) - (b.calculationNumber ?? 0),
    )
    const calcIds = calcs.map((c: any) => c.id)
    setCalculationIds(calcIds)
    calculationIdsRef.current = calcIds

    const newCalculations = calcs.map((c: any) => ({
      chargeRows: (c.lines || []).filter((l: any) => !l.deletedAt).map((l: any) => offerLineToChargeRow(l)),
    }))
    while (newCalculations.length < editableItemsRef.current.length) {
      newCalculations.push({ chargeRows: [] })
    }
    setCalculations(newCalculations)

    // Update special terms and contractor from the switched offer
    setSpecialTerms(offer.specialTerms || '')
    setContractorId(offer.contractorId || null)
    if (offer.contractorId) {
      const cRes = await apiCall<{ id: string; name: string }>(`/api/contractors/contractors/${offer.contractorId}`)
      if (cRes.ok && cRes.result?.name && mountedRef.current) {
        setContractorName(cRes.result.name)
      }
    } else {
      setContractorName(null)
    }
  }, [flushPendingSync])

  // Reset all state
  const reset = useCallback(() => {
    // Clear all pending debounced syncs
    if (syncTimerRef.current) { clearTimeout(syncTimerRef.current); syncTimerRef.current = null }
    if (specialTermsTimerRef.current) { clearTimeout(specialTermsTimerRef.current); specialTermsTimerRef.current = null }
    pendingSyncRef.current = null

    setStep(1)
    setOfferType('sell')
    setOfferStatus('draft')
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
    setOfferNumber(null)
    setCalculationIds([])
    setOfferTabs([])
    setActiveOfferTabIndex(0)
    deletedOfferIdsRef.current.clear()
    setExpandedBoxes(new Set([0]))
    setEditingItems(new Set())
    setExpandedPol(new Set())
    setExpandedPod(new Set())
    setImportDialogItem(null)
    setHistoryDialogItem(null)
    draftCreatingRef.current = false
    existingOfferLoadedRef.current = false
  }, [])

  return {
    // Mode
    isEditMode,

    // Core state
    step,
    setStep,
    offerType,
    setOfferType,
    offerStatus,
    setOfferStatus,
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
    offerNumber,
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

    // Offer tabs
    offerTabs,
    activeOfferTabIndex,
    createOfferTab,
    switchOfferTab,
    deleteOfferTab,
  }
}
