import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ChargeRow } from '../../tasks_board/components/ChargesTable'
import {
  type WizardItem,
  type ProductItem,
  makeEmptyItem,
  offerLineToChargeRow,
} from '../../tasks_board/lib/wizard-types'
import { useChargeSync } from '../../tasks_board/lib/useChargeSync'
import {
  buildDefaultChargeRows,
  reindexSet,
  resolveItemLocations,
  saveItemFieldsToServer,
  createCalculationForItem,
  resolveLocationNamesFromIds,
  resolveCarrierProviderNames,
  resolveClientDisplayName,
} from '../../tasks_board/lib/wizard-utils'

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

  // Group ID — shared across all offers created in the same wizard session
  const groupIdRef = useRef<string | null>(null)

  // Linked projects
  type LinkedProject = { id: string; projectNumber: string }
  const [projects, setProjects] = useState<LinkedProject[]>([])

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
      setProjects(offer.projects || [])
      // Restore groupId from existing offer
      groupIdRef.current = offer.groupId || null

      // Load all sibling offers in the same group (if any)
      let allTabs: OfferTab[] = []
      let activeIdx = 0
      if (offer.groupId) {
        const groupRes = await apiCall<{ items: Array<{ id: string; offerNumber: string; offerLabel?: string }> }>(
          `/api/fms_offers/offers?groupId=${offer.groupId}&limit=50&sortField=createdAt&sortDir=asc`,
        )
        if (groupRes.ok && groupRes.result?.items && groupRes.result.items.length > 1) {
          allTabs = groupRes.result.items.map((o, i) => ({
            offerId: o.id,
            label: o.offerLabel || `Offer #${i + 1}`,
            offerNumber: o.offerNumber || '',
          }))
          activeIdx = allTabs.findIndex((t) => t.offerId === offer.id)
          if (activeIdx === -1) activeIdx = 0
        }
      }
      // Fallback: single tab for the current offer
      if (allTabs.length === 0) {
        allTabs = [{ offerId: offer.id, label: (offer as any).offerLabel || 'Offer #1', offerNumber: offer.offerNumber || '' }]
      }
      setOfferTabs(allTabs)
      offerTabsRef.current = allTabs
      setActiveOfferTabIndex(activeIdx)
      activeOfferTabIndexRef.current = activeIdx
      setContractorId(offer.contractorId || null)
      // Resolve client display name with fallbacks: offer.contractorId → rfq.contractorId → rfq.companyName
      const clientDisplayName = await resolveClientDisplayName({
        contractorId: offer.contractorId || offer.rfq?.contractorId || null,
        companyName: offer.rfq?.companyName || null,
      })
      if (clientDisplayName && mountedRef.current) {
        setContractorName(clientDisplayName)
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
      await resolveLocationNamesFromIds(allItems, mountedRef, setEditableItems)

      // Resolve carrier/provider names from IDs (offer-level, applied to item 0)
      await resolveCarrierProviderNames(
        offer.carrierIds || [],
        offer.providerIds || [],
        mountedRef,
        setEditableItems,
      )
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
    const defaultRows = buildDefaultChargeRows(products)
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
      // Generate a group ID for this wizard session (shared by all tabs)
      if (!groupIdRef.current) {
        groupIdRef.current = crypto.randomUUID()
      }
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
          groupId: groupIdRef.current,
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
          const calcId = await createCalculationForItem(offer.id, i, items[i])
          if (calcId) newCalcIds.push(calcId)
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

  // Charge row sync — shared hook
  const calculationIdsRef = useRef(calculationIds)
  calculationIdsRef.current = calculationIds

  const chargeSync = useChargeSync({
    calculationIdsRef,
    calculationsRef,
    setCalculations,
    offerIdRef,
  })
  const { syncChargeRow, deleteChargeRow, updateCalculation, flushChargeSync, flushQueuedEdits } = chargeSync

  // Flush any pending sync + save item fields
  const flushPendingSync = useCallback(async () => {
    await flushChargeSync()
    const oid = offerIdRef.current
    if (oid) {
      await saveItemFieldsToServer(oid, editableItemsRef.current, calculationIdsRef.current)
    }
  }, [flushChargeSync])

  // Flush queued edits when calculationIds become available
  useEffect(() => {
    flushQueuedEdits(calculationIds)
  }, [calculationIds, flushQueuedEdits])

  const updateItem = useCallback((index: number, patch: Partial<WizardItem>) => {
    setEditableItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )
    resolveItemLocations(patch, index, mountedRef, setEditableItems)
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
    const defaultRows = buildDefaultChargeRows(products || [], false)
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

    const oid = offerIdRef.current
    if (oid) {
      const calcId = await createCalculationForItem(oid, newIndex)
      if (calcId && mountedRef.current) {
        setCalculationIds((prev) => [...prev, calcId])
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

    setExpandedBoxes((prev) => reindexSet(prev, index))
    setEditingItems((prev) => reindexSet(prev, index))
    setExpandedPol((prev) => reindexSet(prev, index))
    setExpandedPod((prev) => reindexSet(prev, index))
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
        groupId: groupIdRef.current,
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
    chargeSync.clearSyncState()
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
    chargeSync.clearSyncState()

    setActiveOfferTabIndex(tabIndex)
    activeOfferTabIndexRef.current = tabIndex
    setOfferId(tab.offerId)
    offerIdRef.current = tab.offerId
    setOfferNumber(tab.offerNumber || null)

    const res = await apiCall<Record<string, any>>(`/api/fms_offers/offers/${tab.offerId}`)
    if (!res.ok || !res.result) return
    const offer = res.result

    // Restore offer-level fields
    setOfferType(offer.type || 'sell')
    setOfferStatus(offer.status || 'draft')
    setDirection(offer.direction || null)
    setTransportMode(offer.transportMode || null)
    setCargoType(offer.cargoType || null)
    if (offer.validUntil) setValidUntil(offer.validUntil)
    setSpecialTerms(offer.specialTerms || '')
    setProjects(offer.projects || [])
    setContractorId(offer.contractorId || null)
    const tabClientName = await resolveClientDisplayName({
      contractorId: offer.contractorId || offer.rfq?.contractorId || null,
      companyName: offer.rfq?.companyName || null,
    })
    if (mountedRef.current) {
      setContractorName(tabClientName)
    }

    // Rebuild calculations and editable items from the switched offer
    const SECTION_TYPES = new Set(['main_freight', 'origin', 'destination'])
    const serverCalcs = (offer.calculations || []).filter((c: any) => !c.deletedAt).sort(
      (a: any, b: any) => (a.calculationNumber ?? 0) - (b.calculationNumber ?? 0),
    )
    const mainCalc = serverCalcs.find((c: any) => c.sectionType === 'main_freight' || c.label === 'Main Freight') || serverCalcs[0]
    const routeCalcs = serverCalcs.filter((c: any) => !SECTION_TYPES.has(c.sectionType) && c.id !== mainCalc?.id)

    const newCalcIds: string[] = []
    const newItems: WizardItem[] = []
    const newCalcs: Array<{ chargeRows: ChargeRow[] }> = []

    if (mainCalc) {
      newCalcIds.push(mainCalc.id)
      newItems.push({
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
      newCalcs.push({
        chargeRows: (mainCalc.lines || []).filter((l: any) => !l.deletedAt).map((l: any) => offerLineToChargeRow(l)),
      })

      for (const rc of routeCalcs) {
        newCalcIds.push(rc.id)
        newItems.push({
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
        newCalcs.push({
          chargeRows: (rc.lines || []).filter((l: any) => !l.deletedAt).map((l: any) => offerLineToChargeRow(l)),
        })
      }
    }

    setCalculationIds(newCalcIds)
    calculationIdsRef.current = newCalcIds
    setEditableItems(newItems.length > 0 ? newItems : [makeEmptyItem()])
    setCalculations(newCalcs.length > 0 ? newCalcs : [{ chargeRows: [] }])
    setExpandedBoxes(new Set(newItems.map((_, i) => i)))

    // Resolve location names and carrier/provider names for the switched offer's items
    await resolveLocationNamesFromIds(newItems, mountedRef, setEditableItems)
    await resolveCarrierProviderNames(
      offer.carrierIds || [],
      offer.providerIds || [],
      mountedRef,
      setEditableItems,
    )
  }, [flushPendingSync])

  // Reset all state
  const reset = useCallback(() => {
    chargeSync.clearSyncState()
    if (specialTermsTimerRef.current) { clearTimeout(specialTermsTimerRef.current); specialTermsTimerRef.current = null }

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
    setProjects([])
    setCalculationIds([])
    setOfferTabs([])
    setActiveOfferTabIndex(0)
    deletedOfferIdsRef.current.clear()
    groupIdRef.current = null
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
    projects,

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

    // Group
    groupId: groupIdRef.current,
  }
}
