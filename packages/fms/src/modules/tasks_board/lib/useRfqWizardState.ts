import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ChargeRow } from '../components/ChargesTable'
import { FMS_CHARGE_UNITS, FMS_DIRECTIONS, FMS_TRANSPORT_MODES } from '../../fms_offers/data/types'
import {
  type ExtractionResult,
  type WizardItem,
  type ProductItem,
  type RfqDetailData,
  type OfferFullData,
  makeEmptyItem,
  normalizeToLowerEnum,
  resolveLocation,
  offerLineToChargeRow,
} from './wizard-types'
import { useChargeSync } from './useChargeSync'
import {
  buildDefaultChargeRows,
  reindexSet,
  resolveItemLocations,
  createCalculationForItem,
  resolveClientDisplayName,
  saveItemFieldsToServer,
  resolveLocationNamesFromIds,
  resolveCarrierProviderNames,
} from './wizard-utils'

type UseRfqWizardStateInput = {
  mode: 'new' | 'existing'
  rfqId: string | null
  open: boolean
}

export function useRfqWizardState({ mode, rfqId: initialRfqId, open }: UseRfqWizardStateInput) {
  const queryClient = useQueryClient()
  const mountedRef = useRef(true)
  const draftCreatingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Core state
  const [step, setStep] = useState(mode === 'existing' ? 1 : 0)
  const [rfqId, setRfqId] = useState<string | null>(initialRfqId)
  const [rfqTitle, setRfqTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [rawText, setRawText] = useState('')
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)

  // Items & calculations
  const [editableItems, setEditableItems] = useState<WizardItem[]>([])
  const [calculations, setCalculations] = useState<Array<{ chargeRows: ChargeRow[] }>>([])

  // Draft offer tracking
  const [offerId, setOfferId] = useState<string | null>(null)
  const [offerNumber, setOfferNumber] = useState<string | null>(null)
  const [calculationIds, setCalculationIds] = useState<string[]>([])

  // Multi-offer tabs
  type OfferTab = { offerId: string; label: string; offerNumber: string }
  const [offerTabs, setOfferTabs] = useState<OfferTab[]>([])
  const [activeOfferTabIndex, setActiveOfferTabIndex] = useState(0)

  // Backwards-compatible accessor for first calculation ID
  const calculationId = calculationIds[0] || null

  // Group ID — shared across all offers created in the same wizard session
  const groupIdRef = useRef<string | null>(null)

  // Special terms (custom conditions for PDF)
  const [specialTerms, setSpecialTerms] = useState('')

  // Resolved client display name for PDF/preview (contractor name → companyName fallback)
  const [clientDisplayName, setClientDisplayName] = useState<string>('')

  // UI state
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set())
  const [editingItems, setEditingItems] = useState<Set<number>>(new Set())
  const [expandedPol, setExpandedPol] = useState<Set<number>>(new Set())
  const [expandedPod, setExpandedPod] = useState<Set<number>>(new Set())
  const [importDialogItem, setImportDialogItem] = useState<number | null>(null)
  const [historyDialogItem, setHistoryDialogItem] = useState<number | null>(null)
  const [expandedOffers, setExpandedOffers] = useState<Set<string>>(new Set())
  const [viewingOfferId, setViewingOfferId] = useState<string | null>(null)

  // Sync rfqId and mode from props when they change
  useEffect(() => {
    setRfqId(initialRfqId)
    if (initialRfqId && mode === 'existing') {
      setStep(1)
    }
  }, [initialRfqId, mode])

  // Fetch RFQ detail for existing mode — staleTime Infinity to prevent refetches while user is editing
  const { data: rfqDetail } = useQuery({
    queryKey: ['rfq-detail', rfqId],
    queryFn: async () => {
      if (!rfqId) return null
      const res = await apiCall<RfqDetailData>(`/api/fms_offers/rfq/${rfqId}`)
      if (!res.ok || !res.result) return null
      return res.result
    },
    enabled: !!rfqId && open && mode === 'existing',
    staleTime: Infinity,
  })

  // Resolve client display name from RFQ (contractor → companyName fallback)
  const clientNameResolvedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!rfqDetail) return
    const key = `${rfqDetail.contractorId ?? ''}::${rfqDetail.companyName ?? ''}`
    if (clientNameResolvedRef.current === key) return
    clientNameResolvedRef.current = key
    ;(async () => {
      const resolved = await resolveClientDisplayName({
        contractorId: rfqDetail.contractorId,
        companyName: rfqDetail.companyName,
      })
      if (mountedRef.current) setClientDisplayName(resolved || '')
    })()
  }, [rfqDetail])

  // Fetch full offer details for existing RFQ
  const offerIds = rfqDetail?.offers?.map((o) => o.id) || []
  const offerQueries = useQueries({
    queries: offerIds.map((oid) => ({
      queryKey: ['offer', oid],
      queryFn: async () => {
        const res = await apiCall<OfferFullData>(`/api/fms_offers/offers/${oid}`)
        if (!res.ok || !res.result) return null
        return res.result
      },
      enabled: !!oid && open,
      staleTime: Infinity,
    })),
  })
  // Extract data from queries using stable keys to avoid infinite re-renders
  const offerDataList = offerQueries.map((q) => q.data)
  const offerDetails = useMemo(
    () => offerDataList.filter((d): d is OfferFullData => d != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by stringified IDs for stability
    [offerDataList.map((d) => d?.id).join(',')],
  )

  // Separate draft vs non-draft offers
  const allDraftOffers = useMemo(
    () => offerDetails.filter((o) => o.status === 'draft'),
    [offerDetails],
  )
  const draftOffer = allDraftOffers[0] ?? undefined
  const existingOffers = useMemo(
    () => offerDetails.filter((o) => o.status !== 'draft'),
    [offerDetails],
  )

  // Sync offer tabs when drafts load — add new drafts, but never re-add deleted ones
  const deletedOfferIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (allDraftOffers.length === 0) return
    setOfferTabs((prev) => {
      const currentIds = new Set(prev.map((t) => t.offerId))
      const newTabs = [...prev]
      let changed = false
      for (const d of allDraftOffers) {
        if (!currentIds.has(d.id) && !deletedOfferIdsRef.current.has(d.id)) {
          newTabs.push({ offerId: d.id, label: (d as any).offerLabel || `Offer #${newTabs.length + 1}`, offerNumber: d.offerNumber })
          changed = true
        }
      }
      return changed ? newTabs : prev
    })
  }, [allDraftOffers])

  // Track whether offer queries have settled (so ensureDraftOffer doesn't race)
  // In 'new' mode: no existing offers to wait for
  // In 'existing' mode: wait until rfqDetail has loaded AND all offer queries are done
  const offersLoading = offerQueries.some((q) => q.isLoading)
  const offersSettled = mode === 'new'
    || (!rfqId)
    || (!!rfqDetail && offerIds.length === 0)
    || (!!rfqDetail && offerIds.length > 0 && !offersLoading)

  // Auto-expand offers as they load
  useEffect(() => {
    if (offerDetails.length === 0) return
    setExpandedOffers((prev) => {
      const next = new Set(prev)
      for (const o of offerDetails) next.add(o.id)
      if (next.size === prev.size) return prev
      return next
    })
  }, [offerDetails])

  // Initialize from RFQ detail (existing mode) — runs ONCE per rfqDetail load
  const rfqDetailInitDoneRef = useRef(false)
  useEffect(() => {
    if (!rfqDetail || mode !== 'existing') return
    // Only initialize once — subsequent rfqDetail refetches must not wipe charge rows
    if (rfqDetailInitDoneRef.current) return
    rfqDetailInitDoneRef.current = true

    // Set title — prefer title, fall back to companyName
    setRfqTitle(rfqDetail.title || rfqDetail.companyName || '')

    // Set raw text
    if (rfqDetail.rawText) setRawText(rfqDetail.rawText)

    // Set extraction from stored data (for highlights display)
    if (rfqDetail.highlights && rfqDetail.highlights.length > 0 && rfqDetail.rawText) {
      setExtraction({
        extraction: {
          companyName: rfqDetail.companyName,
          contactPerson: rfqDetail.contactPerson,
          senderEmail: rfqDetail.senderEmail,
          highlights: rfqDetail.highlights,
          items: [],
        },
        model: '',
        tokens: 0,
      })
    }

    // Initialize items from server
    const serverItems = rfqDetail.items
    if (serverItems && serverItems.length > 0) {
      const items: WizardItem[] = serverItems.map((item) => ({
        containerType: item.containerType,
        containerCount: item.containerCount,
        origin: item.origin,
        originLocationId: item.originLocationId || null,
        destination: item.destination,
        destinationLocationId: item.destinationLocationId || null,
        placeOfLoading: null,
        placeOfLoadingId: null,
        placeOfDelivery: null,
        placeOfDeliveryId: null,
        cargoDescription: item.cargoDescription,
        weightKg: item.weightKg ? parseFloat(item.weightKg) || null : null,
        readinessDate: item.readinessDate,
        incoterm: item.incoterm,
        transportMode: item.transportMode,
        notes: item.notes,
        carrierIds: [],
        carrierNames: [],
        providerIds: [],
        providerNames: [],
      }))
      setEditableItems(items)
      setCalculations(serverItems.map(() => ({ chargeRows: [] })))
      setExpandedBoxes(new Set(serverItems.map((_, i) => i)))
    } else {
      setEditableItems([makeEmptyItem()])
      setCalculations([{ chargeRows: [] }])
      setExpandedBoxes(new Set([0]))
    }
  }, [rfqDetail, mode])

  // Load draft offer lines into calculations when draft offer is loaded (once only).
  // Does NOT set offerId or calculationIds — ensureDraftOffer is the single
  // place that sets those (including creating any missing calculations).
  const draftLinesLoadedRef = useRef(false)
  useEffect(() => {
    if (!draftOffer) return
    if (draftLinesLoadedRef.current) return
    draftLinesLoadedRef.current = true
    console.log('[RfqWizard:DIAG] draftOffer loaded, id:', draftOffer.id, 'calcs:', draftOffer.calculations?.length)
    if (draftOffer.specialTerms) setSpecialTerms(draftOffer.specialTerms)

    // Route-level calculations (exclude section-only main_freight/origin/destination rows used for charge grouping)
    const SECTION_TYPES = new Set(['main_freight', 'origin', 'destination'])
    const allCalcs = draftOffer.calculations || []
    const routeCalcs = allCalcs.filter((c) => !c.sectionType || !SECTION_TYPES.has(c.sectionType))

    // Hydrate editable items with persisted route info (containers, IDs, offer-level fields)
    // Only hydrate when items either have unresolved IDs (no ID stored) or the server has data we haven't loaded.
    if (routeCalcs.length > 0) {
      setEditableItems((prev) => {
        if (prev.length === 0) return prev
        const hydrated = prev.map((item, idx) => {
          const rc = routeCalcs[idx]
          if (!rc) return item
          const inheritOfferLevel = idx === 0
          return {
            ...item,
            containerType: item.containerType ?? rc.containers?.[0] ?? null,
            containerCount: item.containerCount ?? (rc.containers?.length || null),
            originLocationId: item.originLocationId ?? rc.originLocationId ?? null,
            destinationLocationId: item.destinationLocationId ?? rc.destinationLocationId ?? null,
            placeOfLoadingId: item.placeOfLoadingId ?? rc.placeOfLoadingId ?? null,
            placeOfDeliveryId: item.placeOfDeliveryId ?? rc.placeOfDeliveryId ?? null,
            incoterm: inheritOfferLevel ? (item.incoterm ?? draftOffer.incoterm ?? null) : item.incoterm,
            transportMode: inheritOfferLevel ? (item.transportMode ?? draftOffer.transportMode ?? null) : item.transportMode,
            cargoDescription: inheritOfferLevel ? (item.cargoDescription ?? draftOffer.customerNotes ?? null) : item.cargoDescription,
            carrierIds: inheritOfferLevel && (!item.carrierIds || item.carrierIds.length === 0)
              ? (draftOffer.carrierIds ?? [])
              : item.carrierIds,
            providerIds: inheritOfferLevel && (!item.providerIds || item.providerIds.length === 0)
              ? (draftOffer.providerIds ?? [])
              : item.providerIds,
          }
        })
        return hydrated
      })

      // Expand POL/POD slots so the user sees the loaded values (mirrors stored IDs)
      const polIndexes = routeCalcs.reduce<number[]>((acc, rc, idx) => rc.placeOfLoadingId ? [...acc, idx] : acc, [])
      const podIndexes = routeCalcs.reduce<number[]>((acc, rc, idx) => rc.placeOfDeliveryId ? [...acc, idx] : acc, [])
      if (polIndexes.length > 0) setExpandedPol((prev) => { const n = new Set(prev); polIndexes.forEach((i) => n.add(i)); return n })
      if (podIndexes.length > 0) setExpandedPod((prev) => { const n = new Set(prev); podIndexes.forEach((i) => n.add(i)); return n })
    }

    // Map charge rows from calculation lines to their route-indexed chargeRows buckets
    if (allCalcs.length > 0) {
      const hasAnyLines = allCalcs.some((c) => c.lines.length > 0)
      if (hasAnyLines) {
        setCalculations((prev) => {
          const updated = [...prev]
          for (let i = 0; i < allCalcs.length; i++) {
            if (allCalcs[i].lines.length > 0) {
              const calcSectionType = (allCalcs[i] as any).sectionType || null
              const rows = allCalcs[i].lines.map((line) => {
                const row = offerLineToChargeRow(line)
                if (calcSectionType && !row.sectionType) row.sectionType = calcSectionType
                return row
              })
              if (i < updated.length) {
                updated[i] = { chargeRows: rows }
              } else {
                updated.push({ chargeRows: rows })
              }
            }
          }
          return updated
        })
      }
    }

    // Resolve location names and carrier/provider names for display
    ;(async () => {
      // Use a short microtask to let the setEditableItems above flush first
      await Promise.resolve()
      if (!mountedRef.current) return
      await resolveLocationNamesFromIds(editableItemsRef.current, mountedRef, setEditableItems)
      await resolveCarrierProviderNames(
        draftOffer.carrierIds ?? [],
        draftOffer.providerIds ?? [],
        mountedRef,
        setEditableItems,
      )
    })()
  }, [draftOffer])

  // Initialize empty calculations when items change (if not loaded from draft)
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

  // Track calculations in a ref to avoid infinite loops in effects
  const calculationsRef = useRef(calculations)
  calculationsRef.current = calculations

  // Populate default charge rows from products when no rows exist
  useEffect(() => {
    if (!products || products.length === 0 || editableItems.length === 0) return
    // Don't overwrite if a draft offer exists — its saved lines (even if empty for some routes) are authoritative
    if (draftOfferRef.current) return
    const current = calculationsRef.current
    if (current.every((c) => c.chargeRows.length > 0)) return
    const defaultRows = buildDefaultChargeRows(products)
    setCalculations((prev) => {
      if (prev.length === 0) return prev
      return prev.map((calc) =>
        calc.chargeRows.length > 0 ? calc : { ...calc, chargeRows: defaultRows.map((r) => ({ ...r, id: `${r.id}-${Math.random()}` })) },
      )
    })
  }, [products, editableItems.length, offerId])

  // Auto-resolve extracted location names
  // Returns resolved map so caller can use it for server updates
  const resolveLocationsForItems = useCallback(async (items: WizardItem[]): Promise<Map<string, { id: string; name: string }>> => {
    const namesToResolve = new Set<string>()
    for (const item of items) {
      if (item.origin) namesToResolve.add(item.origin)
      if (item.destination) namesToResolve.add(item.destination)
    }
    if (namesToResolve.size === 0) return new Map()

    const resolved = new Map<string, { id: string; name: string }>()
    await Promise.all(
      Array.from(namesToResolve).map(async (name) => {
        const loc = await resolveLocation(name)
        if (loc) resolved.set(name, loc)
      }),
    )
    if (!mountedRef.current || resolved.size === 0) return resolved

    setEditableItems((prev) =>
      prev.map((item) => {
        const updates: Partial<WizardItem> = {}
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
    return resolved
  }, [])

  // Auto-resolve location names → IDs for items that have names but missing IDs
  const locationResolvedRef = useRef(false)
  useEffect(() => {
    if (locationResolvedRef.current) return
    const hasUnresolved = editableItems.some(
      (item) =>
        (item.origin && !item.originLocationId) ||
        (item.destination && !item.destinationLocationId),
    )
    if (!hasUnresolved || editableItems.length === 0) return
    locationResolvedRef.current = true
    resolveLocationsForItems(editableItems)
  }, [editableItems, resolveLocationsForItems])

  // Handle extraction (new mode)
  const handleExtract = useCallback(async (text: string) => {
    setRawText(text)
    setCreating(true)
    try {
      // 1. Create RFQ immediately
      const rfqRes = await apiCall<{ id: string }>('/api/fms_offers/rfq', {
        method: 'POST',
        body: JSON.stringify({ rawText: text }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!rfqRes.ok || !rfqRes.result?.id) {
        setCreating(false)
        return
      }
      const newRfqId = rfqRes.result.id
      if (!mountedRef.current) return
      setRfqId(newRfqId)
      setExtracting(true)
      setStep(1)
      setCreating(false)

      try {
        // 2. Extract
        const extractRes = await apiCall<ExtractionResult>('/api/fms_offers/rfq/extract', {
          method: 'POST',
          body: JSON.stringify({ text }),
          headers: { 'Content-Type': 'application/json' },
        })

        if (extractRes.ok && extractRes.result) {
          const result = extractRes.result
          if (mountedRef.current) {
            setExtraction(result)
            setRfqTitle(result.extraction.summary || '')
          }

          // Initialize editable items
          const newItems: WizardItem[] = result.extraction.items.map((item) => ({
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
            carrierIds: [],
            carrierNames: [],
            providerIds: [],
            providerNames: [],
          }))

          if (mountedRef.current) {
            setEditableItems(newItems)
            const itemCalcs = result.extraction.items.map(() => ({ chargeRows: [] as ChargeRow[] }))
            setCalculations(itemCalcs.length > 0 ? itemCalcs : [{ chargeRows: [] }])
            setExpandedBoxes(new Set(result.extraction.items.map((_, i) => i)))
          }

          // Resolve location names → IDs before updating server
          const resolvedLocations = await resolveLocationsForItems(newItems)

          // 3. Update RFQ with extracted data (runs regardless of mount state)
          const ext = result.extraction
          const firstOrigin = ext.items?.[0]?.origin || null
          const firstDest = ext.items?.[0]?.destination || null
          const updateBody = {
            title: ext.summary || null,
            companyName: ext.companyName || null,
            contactPerson: ext.contactPerson || null,
            senderEmail: ext.senderEmail || null,
            senderName: ext.contactPerson || null,
            rawText: text,
            extractedData: {
              companyName: ext.companyName ?? null,
              contactPerson: ext.contactPerson ?? null,
              senderEmail: ext.senderEmail ?? null,
              direction: ext.direction ?? null,
              summary: ext.summary ?? null,
              confidence: ext.confidence ?? null,
            },
            highlights: ext.highlights && ext.highlights.length > 0 ? ext.highlights : null,
            direction: normalizeToLowerEnum(ext.direction, FMS_DIRECTIONS),
            transportMode: normalizeToLowerEnum(ext.items?.[0]?.transportMode, FMS_TRANSPORT_MODES),
            origin: firstOrigin,
            destination: firstDest,
            originLocationId: firstOrigin && resolvedLocations.has(firstOrigin) ? resolvedLocations.get(firstOrigin)!.id : null,
            destinationLocationId: firstDest && resolvedLocations.has(firstDest) ? resolvedLocations.get(firstDest)!.id : null,
            items: ext.items?.map((item, idx) => ({
              itemNumber: idx + 1,
              containerType: item.containerType || null,
              containerCount: item.containerCount || null,
              origin: item.origin || null,
              destination: item.destination || null,
              originLocationId: item.origin && resolvedLocations.has(item.origin) ? resolvedLocations.get(item.origin)!.id : null,
              destinationLocationId: item.destination && resolvedLocations.has(item.destination) ? resolvedLocations.get(item.destination)!.id : null,
              cargoDescription: item.cargoDescription || null,
              weightKg: item.weightKg || null,
              readinessDate: item.readinessDate || null,
              incoterm: item.incoterm || null,
              transportMode: normalizeToLowerEnum(item.transportMode, FMS_TRANSPORT_MODES),
              notes: item.notes || null,
              carrierIds: [],
              carrierNames: [],
              providerIds: [],
              providerNames: [],
            })),
          }
          const updateRes = await apiCall(`/api/fms_offers/rfq/${newRfqId}`, {
            method: 'PUT',
            body: JSON.stringify(updateBody),
            headers: { 'Content-Type': 'application/json' },
          })
          if (!updateRes.ok) {
            console.error('[RfqWizard] Failed to save extraction data:', JSON.stringify(updateRes))
          }
        }
      } catch (err) {
        console.error('[RfqWizard] extraction error:', err)
      } finally {
        if (mountedRef.current) setExtracting(false)
      }
    } catch (error) {
      console.error('[RfqWizard] Error:', error)
      if (mountedRef.current) setCreating(false)
    }
  }, [resolveLocationsForItems])

  // Refs for ensureDraftOffer to avoid recreating the callback
  const offerIdRef = useRef(offerId)
  offerIdRef.current = offerId
  const rfqIdRef = useRef(rfqId)
  rfqIdRef.current = rfqId
  const draftOfferRef = useRef(draftOffer)
  draftOfferRef.current = draftOffer
  const editableItemsRef = useRef(editableItems)
  editableItemsRef.current = editableItems

  // Ensure draft offer exists (called on Step 2 entry)
  // Creates one calculation per editable item (route)
  const ensureDraftOffer = useCallback(async () => {
    if (offerIdRef.current || !rfqIdRef.current || draftCreatingRef.current) return
    // Check if draft offer already found from server data
    if (draftOfferRef.current) {
      setOfferId(draftOfferRef.current.id)
      offerIdRef.current = draftOfferRef.current.id
      setOfferNumber(draftOfferRef.current.offerNumber || null)

      // Register first offer tab if not yet tracked
      const firstTab = { offerId: draftOfferRef.current.id, label: 'Offer #1', offerNumber: draftOfferRef.current.offerNumber || '' }
      setOfferTabs((prev) => prev.length === 0 ? [firstTab] : prev)
      if (offerTabsRef.current.length === 0) offerTabsRef.current = [firstTab]

      const calcs = draftOfferRef.current.calculations || []
      const existingCalcIds = calcs.map((c) => c.id)

      // Create missing calculations for items beyond what the draft has
      const items = editableItemsRef.current
      const newCalcIds = [...existingCalcIds]
      for (let i = calcs.length; i < items.length; i++) {
        const calcId = await createCalculationForItem(draftOfferRef.current.id, i, items[i])
        if (calcId) newCalcIds.push(calcId)
      }

      if (mountedRef.current) {
        setCalculationIds(newCalcIds)
        calculationIdsRef.current = newCalcIds
      }
      return
    }
    draftCreatingRef.current = true
    try {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + 30)
      const firstItem = editableItemsRef.current[0]
      // Generate a group ID for this wizard session (shared by all tabs)
      if (!groupIdRef.current) {
        groupIdRef.current = crypto.randomUUID()
      }
      const offerRes = await apiCall<{ id: string; offerNumber?: string; calculations?: Array<{ id: string }> }>('/api/fms_offers/offers', {
        method: 'POST',
        body: JSON.stringify({
          rfqId: rfqIdRef.current,
          groupId: groupIdRef.current,
          validUntil: validUntil.toISOString(),
          transportMode: firstItem?.transportMode || null,
          incoterm: firstItem?.incoterm || null,
          carrierIds: firstItem?.carrierIds?.length ? firstItem.carrierIds : null,
          providerIds: firstItem?.providerIds?.length ? firstItem.providerIds : null,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!offerRes.ok) {
        console.error('[RfqWizard] Failed to create draft offer:', JSON.stringify(offerRes))
        return
      }
      const offer = offerRes.result
      if (offer?.id && mountedRef.current) {
        setOfferId(offer.id)
        offerIdRef.current = offer.id
        setOfferNumber(offer.offerNumber || null)

        // Register the first offer tab
        const firstTab = { offerId: offer.id, label: 'Offer #1', offerNumber: offer.offerNumber || '' }
        setOfferTabs((prev) => prev.length === 0 ? [firstTab] : prev)
        if (offerTabsRef.current.length === 0) offerTabsRef.current = [firstTab]

        const newCalcIds: string[] = []
        const firstCalcId = offer.calculations?.[0]?.id
        if (firstCalcId) newCalcIds.push(firstCalcId)

        // Create additional calculations for extra routes
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
    } catch (err) {
      console.error('[RfqWizard] Error creating draft offer:', err)
    } finally {
      draftCreatingRef.current = false
    }
  }, []) // stable — uses refs internally

  // Auto-create draft offer when on pricing step with rfqId but no offerId.
  // In existing mode, wait until offer queries have settled so we don't
  // create a duplicate draft while the existing one is still loading.
  // Also wait for editableItems to be populated so ensureDraftOffer creates
  // the correct number of calculations (one per route/item).
  useEffect(() => {
    if (step >= 1 && rfqId && !offerId && !draftCreatingRef.current && offersSettled && editableItems.length > 0) {
      ensureDraftOffer()
    }
  }, [step, rfqId, offerId, ensureDraftOffer, offersSettled, editableItems.length])

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

  // Flush any pending sync + ensure draft + orphan cleanup
  const flushPendingSync = useCallback(async () => {
    await ensureDraftOffer()
    await flushChargeSync()

    // Persist item-level fields (origin/destination/POL/POD IDs, carriers, incoterm, transport mode)
    const oid = offerIdRef.current
    if (oid) {
      await saveItemFieldsToServer(oid, editableItemsRef.current, calculationIdsRef.current)
    }

    // Clean up orphaned server lines that are no longer in client state
    if (oid) {
      const calcs = calculationsRef.current
      const clientRowIds = new Set<string>()
      for (const calc of calcs) {
        for (const row of calc.chargeRows) {
          if (!row.id.startsWith('new-')) clientRowIds.add(row.id)
        }
      }
      try {
        const offerRes = await apiCall<{ calculations?: Array<{ lines?: Array<{ id: string }> }> }>(`/api/fms_offers/offers/${oid}`)
        if (offerRes.ok && offerRes.result?.calculations) {
          for (const calc of offerRes.result.calculations) {
            for (const line of (calc.lines || [])) {
              if (!clientRowIds.has(line.id)) {
                await apiCall(`/api/fms_offers/offer-lines/${line.id}`, { method: 'DELETE' })
              }
            }
          }
        }
      } catch {
        // Non-critical — orphan cleanup is best-effort
      }
    }
  }, [flushChargeSync, ensureDraftOffer])

  // Flush queued edits when calculationIds become available
  useEffect(() => {
    flushQueuedEdits(calculationIds)
  }, [calculationIds, flushQueuedEdits])

  // Debounced sync of offer-level fields (carrier, provider, incoterm, transportMode)
  const offerFieldsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncOfferFields = useCallback((patch: Partial<WizardItem>) => {
    const oid = offerIdRef.current
    if (!oid) return
    const offerPatch: Record<string, unknown> = {}
    if ('carrierIds' in patch) offerPatch.carrierIds = patch.carrierIds?.length ? patch.carrierIds : null
    if ('providerIds' in patch) offerPatch.providerIds = patch.providerIds?.length ? patch.providerIds : null
    if ('incoterm' in patch) offerPatch.incoterm = patch.incoterm || null
    if ('transportMode' in patch) offerPatch.transportMode = patch.transportMode || null
    if (Object.keys(offerPatch).length === 0) return
    if (offerFieldsSyncTimerRef.current) clearTimeout(offerFieldsSyncTimerRef.current)
    offerFieldsSyncTimerRef.current = setTimeout(async () => {
      await apiCall(`/api/fms_offers/offers/${oid}`, {
        method: 'PUT',
        body: JSON.stringify(offerPatch),
        headers: { 'Content-Type': 'application/json' },
      })
    }, 300)
  }, [])

  // Debounced sync of RFQ top-level route fields (origin/destination/POL/POD — item 0 only)
  // Keeps the task-board read path in sync so ports display via a proper location reference
  // (ID + name) rather than a stale free-text name.
  const rfqRouteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncRfqRouteFields = useCallback((patch: Partial<WizardItem>) => {
    const currentRfqId = rfqIdRef.current
    if (!currentRfqId) return
    const rfqPatch: Record<string, unknown> = {}
    if ('originLocationId' in patch) rfqPatch.originLocationId = patch.originLocationId || null
    if ('origin' in patch) rfqPatch.origin = patch.origin || null
    if ('destinationLocationId' in patch) rfqPatch.destinationLocationId = patch.destinationLocationId || null
    if ('destination' in patch) rfqPatch.destination = patch.destination || null
    if ('placeOfLoadingId' in patch) rfqPatch.placeOfLoadingId = patch.placeOfLoadingId || null
    if ('placeOfLoading' in patch) rfqPatch.placeOfLoading = patch.placeOfLoading || null
    if ('placeOfDeliveryId' in patch) rfqPatch.placeOfDeliveryId = patch.placeOfDeliveryId || null
    if ('placeOfDelivery' in patch) rfqPatch.placeOfDelivery = patch.placeOfDelivery || null
    if (Object.keys(rfqPatch).length === 0) return
    if (rfqRouteSyncTimerRef.current) clearTimeout(rfqRouteSyncTimerRef.current)
    rfqRouteSyncTimerRef.current = setTimeout(async () => {
      await apiCall(`/api/fms_offers/rfq/${currentRfqId}`, {
        method: 'PUT',
        body: JSON.stringify(rfqPatch),
        headers: { 'Content-Type': 'application/json' },
      })
    }, 300)
  }, [])

  const updateItem = useCallback((index: number, patch: Partial<WizardItem>) => {
    setEditableItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )
    // Sync offer-level + RFQ-level fields for the first item
    if (index === 0) {
      syncOfferFields(patch)
      syncRfqRouteFields(patch)
    }
    // Auto-resolve location names → IDs
    resolveItemLocations(patch, index, mountedRef, setEditableItems)
  }, [syncOfferFields, syncRfqRouteFields])

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

    const remainingItems = editableItemsRef.current.filter((_, i) => i !== index)
    setEditableItems(remainingItems)
    setCalculations((prev) => prev.filter((_, i) => i !== index))
    setCalculationIds((prev) => prev.filter((_, i) => i !== index))

    setExpandedBoxes((prev) => reindexSet(prev, index))
    setEditingItems((prev) => reindexSet(prev, index))
    setExpandedPol((prev) => reindexSet(prev, index))
    setExpandedPod((prev) => reindexSet(prev, index))

    // Update RFQ items on the server to remove this route
    const currentRfqId = rfqIdRef.current
    if (currentRfqId) {
      const updatedItems = remainingItems.map((item, idx) => ({
        itemNumber: idx + 1,
        containerType: item.containerType || null,
        containerCount: item.containerCount || null,
        origin: item.origin || null,
        destination: item.destination || null,
        cargoDescription: item.cargoDescription || null,
        weightKg: item.weightKg || null,
        readinessDate: item.readinessDate || null,
        incoterm: item.incoterm || null,
        transportMode: normalizeToLowerEnum(item.transportMode, FMS_TRANSPORT_MODES),
        notes: item.notes || null,
      }))
      apiCall(`/api/fms_offers/rfq/${currentRfqId}`, {
        method: 'PUT',
        body: JSON.stringify({ items: updatedItems }),
        headers: { 'Content-Type': 'application/json' },
      }).catch((err) => {
        console.error('[RfqWizard] Failed to update RFQ items:', err)
      })
    }
  }, [deleteChargeRow])

  // Title editing
  const handleTitleClick = useCallback(() => {
    setTitleDraft(rfqTitle)
    setEditingTitle(true)
  }, [rfqTitle])

  const handleTitleSave = useCallback(async () => {
    const newTitle = titleDraft.trim()
    setRfqTitle(newTitle)
    setEditingTitle(false)
    if (rfqId) {
      await apiCall(`/api/fms_offers/rfq/${rfqId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: newTitle || null }),
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }, [titleDraft, rfqId])

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingTitle(false)
    }
  }, [handleTitleSave])

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
    if (!rfqId || sending) return
    setSending(true)
    try {
      // Flush any pending charge syncs before sending
      await flushPendingSync()

      // If we have an existing draft offer, transition it to sent
      if (offerId) {
        await apiCall(`/api/fms_offers/offers/${offerId}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'sent' }),
          headers: { 'Content-Type': 'application/json' },
        })
      } else {
        // Create offer + lines in one shot (legacy path for new mode without draft)
        const validUntil = new Date()
        validUntil.setDate(validUntil.getDate() + 30)
        const firstItem = editableItems[0]

        const offerRes = await apiCall<{ id: string; calculations?: Array<{ id: string }> }>('/api/fms_offers/offers', {
          method: 'POST',
          body: JSON.stringify({
            rfqId,
            validUntil: validUntil.toISOString(),
            direction: extraction?.extraction.direction || null,
            transportMode: firstItem?.transportMode || null,
          }),
          headers: { 'Content-Type': 'application/json' },
        })

        const offer = offerRes.result
        if (!offer?.id) throw new Error('Failed to create offer')
        const calcId = offer.calculations?.[0]?.id

        if (calcId && firstItem) {
          await apiCall(`/api/fms_offers/calculations/${calcId}`, {
            method: 'PUT',
            body: JSON.stringify({
              originLocationId: firstItem.originLocationId,
              destinationLocationId: firstItem.destinationLocationId,
              placeOfLoadingId: firstItem.placeOfLoadingId,
              placeOfDeliveryId: firstItem.placeOfDeliveryId,
            }),
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const allEnabledRows = calculations.flatMap((calc) => calc.chargeRows.filter((r) => r.isEnabled))
        if (allEnabledRows.length > 0 && calcId) {
          await Promise.all(
            allEnabledRows.map((row) =>
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

        // Also mark as sent
        await apiCall(`/api/fms_offers/offers/${offer.id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'sent' }),
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Update RFQ status
      await apiCall(`/api/fms_offers/rfq/${rfqId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'in_progress' }),
        headers: { 'Content-Type': 'application/json' },
      })

      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
      queryClient.invalidateQueries({ queryKey: ['rfq-table'] })
      queryClient.invalidateQueries({ queryKey: ['rfq-detail', rfqId] })
    } catch (error) {
      console.error('[RfqWizard] Failed to send offer:', error)
    } finally {
      if (mountedRef.current) setSending(false)
    }
  }, [rfqId, sending, offerId, editableItems, calculations, extraction, queryClient, flushPendingSync])

  // Reset all state
  // Refs for offer tab management (avoid stale closures)
  const offerTabsRef = useRef(offerTabs)
  offerTabsRef.current = offerTabs
  const activeOfferTabIndexRef = useRef(activeOfferTabIndex)
  activeOfferTabIndexRef.current = activeOfferTabIndex

  // Create a new offer tab (parallel alternative)
  const createOfferTab = useCallback(async () => {
    const currentRfqId = rfqIdRef.current
    if (!currentRfqId) return
    const firstItem = editableItemsRef.current[0]
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 30)

    // Flush pending changes for the current offer before creating a new one
    await flushPendingSync()

    if (!groupIdRef.current) {
      groupIdRef.current = crypto.randomUUID()
    }

    const offerRes = await apiCall<{ id: string; offerNumber?: string; calculations?: Array<{ id: string }> }>('/api/fms_offers/offers', {
      method: 'POST',
      body: JSON.stringify({
        rfqId: currentRfqId,
        groupId: groupIdRef.current,
        validUntil: validUntil.toISOString(),
        transportMode: firstItem?.transportMode || null,
        incoterm: firstItem?.incoterm || null,
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
    // Invalidate queries to pick up the new offer
    queryClient.invalidateQueries({ queryKey: ['rfq-detail', currentRfqId] })
  }, [queryClient, flushPendingSync, chargeSync])

  // Delete an offer tab (not the first one)
  const deleteOfferTab = useCallback(async (tabIndex: number) => {
    if (tabIndex === 0) return // never delete first tab
    const tabs = offerTabsRef.current
    const tab = tabs[tabIndex]
    if (!tab) return

    // Track as deleted so sync effect doesn't re-add it
    deletedOfferIdsRef.current.add(tab.offerId)

    // Delete the offer on server
    try {
      await apiCall(`/api/fms_offers/offers/${tab.offerId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch { /* best-effort */ }

    // Remove tab
    const newTabs = tabs.filter((_, i) => i !== tabIndex)
    setOfferTabs(newTabs)
    offerTabsRef.current = newTabs

    // If we deleted the active tab, switch to the previous one
    const currentActive = activeOfferTabIndexRef.current
    if (currentActive >= tabIndex) {
      const newActive = Math.max(0, currentActive - 1)
      setActiveOfferTabIndex(newActive)
      activeOfferTabIndexRef.current = newActive
      chargeSync.clearSyncState()
      // Load that tab's data
      const activeTab = newTabs[newActive]
      if (activeTab) {
        setOfferId(activeTab.offerId)
        offerIdRef.current = activeTab.offerId
        setOfferNumber(activeTab.offerNumber)
        const res = await apiCall<OfferFullData>(`/api/fms_offers/offers/${activeTab.offerId}`)
        if (res.ok && res.result) {
          const calcs = (res.result.calculations || []).filter((c: any) => !(c as any).deletedAt)
          setCalculationIds(calcs.map((c) => c.id))
          calculationIdsRef.current = calcs.map((c) => c.id)
          setCalculations(calcs.map((c) => ({
            chargeRows: c.lines.filter((l: any) => !(l as any).deletedAt).map((line) => {
              const row = offerLineToChargeRow(line)
              if ((c as any).sectionType && !row.sectionType) row.sectionType = (c as any).sectionType
              return row
            }),
          })))
        }
      }
    }

    // Invalidate queries
    const currentRfqId = rfqIdRef.current
    if (currentRfqId) {
      queryClient.invalidateQueries({ queryKey: ['rfq-detail', currentRfqId] })
      queryClient.invalidateQueries({ queryKey: ['rfq-board'] })
    }
  }, [queryClient])

  // Switch active offer tab
  const switchOfferTab = useCallback(async (tabIndex: number) => {
    if (tabIndex === activeOfferTabIndexRef.current) return
    const tab = offerTabsRef.current[tabIndex]
    if (!tab) return

    // Flush pending changes for current offer
    await flushPendingSync()

    // Clear per-offer tracking state so it doesn't leak to the new tab
    chargeSync.clearSyncState()

    setActiveOfferTabIndex(tabIndex)
    activeOfferTabIndexRef.current = tabIndex
    setOfferId(tab.offerId)
    offerIdRef.current = tab.offerId
    setOfferNumber(tab.offerNumber)

    // Load the offer data
    const res = await apiCall<OfferFullData>(`/api/fms_offers/offers/${tab.offerId}`)
    if (!res.ok || !res.result) return
    const offer = res.result

    // Restore offer-level fields
    if (offer.specialTerms != null) setSpecialTerms(offer.specialTerms)

    // Filter out soft-deleted calculations and lines
    const calcs = (offer.calculations || []).filter((c: any) => !(c as any).deletedAt)
    const calcIds = calcs.map((c) => c.id)
    setCalculationIds(calcIds)
    calculationIdsRef.current = calcIds

    // Load charge rows from the selected offer
    const newCalculations = calcs.map((c) => ({
      chargeRows: c.lines.filter((line: any) => !(line as any).deletedAt).length > 0
        ? c.lines.filter((line: any) => !(line as any).deletedAt).map((line) => {
            const row = offerLineToChargeRow(line)
            if ((c as any).sectionType && !row.sectionType) row.sectionType = (c as any).sectionType
            return row
          })
        : [],
    }))
    // Ensure we have at least as many calculation slots as editable items
    while (newCalculations.length < editableItemsRef.current.length) {
      newCalculations.push({ chargeRows: [] })
    }
    setCalculations(newCalculations)
  }, [flushPendingSync, chargeSync])

  const reset = useCallback(() => {
    setStep(0)
    setRawText('')
    setRfqId(null)
    setRfqTitle('')
    setEditingTitle(false)
    setTitleDraft('')
    setExtraction(null)
    setExtracting(false)
    setCreating(false)
    setSending(false)
    setSpecialTerms('')
    setClientDisplayName('')
    clientNameResolvedRef.current = null
    setEditableItems([])
    setCalculations([])
    setOfferId(null)
    setOfferNumber(null)
    setCalculationIds([])
    setExpandedBoxes(new Set())
    setEditingItems(new Set())
    setExpandedPol(new Set())
    setExpandedPod(new Set())
    setImportDialogItem(null)
    setHistoryDialogItem(null)
    setExpandedOffers(new Set())
    setViewingOfferId(null)
    setOfferTabs([])
    setActiveOfferTabIndex(0)
    deletedOfferIdsRef.current.clear()
    groupIdRef.current = null
    chargeSync.clearSyncState()
    draftLinesLoadedRef.current = false
    draftCreatingRef.current = false
    rfqDetailInitDoneRef.current = false
  }, [chargeSync])

  return {
    // Core state
    step,
    setStep,
    rfqId,
    rfqTitle,
    rawText,
    extraction,
    extracting,
    creating,
    sending,

    // Items & calculations
    editableItems,
    calculations,
    products,

    // Draft offer
    offerId,
    offerNumber,
    calculationId,
    existingOffers,
    draftOffer,
    specialTerms,
    updateSpecialTerms,
    clientDisplayName,

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
    expandedOffers,
    setExpandedOffers,
    viewingOfferId,
    setViewingOfferId,

    // Title editing
    editingTitle,
    titleDraft,
    setTitleDraft,
    handleTitleClick,
    handleTitleSave,
    handleTitleKeyDown,

    // Actions
    handleExtract,
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

    // Data
    rfqDetail,
  }
}
