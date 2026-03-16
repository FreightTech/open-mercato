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
  const [calculationId, setCalculationId] = useState<string | null>(null)

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

  // Fetch RFQ detail for existing mode
  const { data: rfqDetail } = useQuery({
    queryKey: ['rfq-detail', rfqId],
    queryFn: async () => {
      if (!rfqId) return null
      const res = await apiCall<RfqDetailData>(`/api/fms_offers/rfq/${rfqId}`)
      if (!res.ok || !res.result) return null
      return res.result
    },
    enabled: !!rfqId && open && mode === 'existing',
  })

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
      staleTime: 30_000,
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
  const draftOffer = useMemo(
    () => offerDetails.find((o) => o.status === 'draft'),
    [offerDetails],
  )
  const existingOffers = useMemo(
    () => offerDetails.filter((o) => o.status !== 'draft'),
    [offerDetails],
  )

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

  // Initialize from RFQ detail (existing mode)
  const rfqDetailInitRef = useRef<string | null>(null)
  useEffect(() => {
    if (!rfqDetail || mode !== 'existing') return
    // Prevent re-initializing for the same rfq detail data
    const detailKey = rfqDetail.title + '|' + rfqDetail.items?.length + '|' + (rfqDetail.highlights?.length ?? 0)
    if (rfqDetailInitRef.current === detailKey) return
    rfqDetailInitRef.current = detailKey

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

  // Load draft offer lines into calculations when draft offer is loaded
  useEffect(() => {
    if (!draftOffer) return
    setOfferId(draftOffer.id)
    const calc = draftOffer.calculations[0]
    if (calc) {
      setCalculationId(calc.id)
      if (calc.lines.length > 0) {
        const rows = calc.lines.map(offerLineToChargeRow)
        // Put all lines into item 0 for now (single-calculation model)
        setCalculations((prev) => {
          if (prev.length === 0) return [{ chargeRows: rows }]
          return prev.map((c, i) => i === 0 ? { chargeRows: rows } : c)
        })
        return // Don't populate with default products
      }
    }
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
    // Don't overwrite if draft offer lines were loaded (server IDs don't start with 'new-')
    const current = calculationsRef.current
    if (offerId && current.some((c) => c.chargeRows.length > 0 && !c.chargeRows[0].id.startsWith('new-'))) return
    // Don't overwrite if any calc already has rows
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
      isEnabled: false,
    }))
    setCalculations((prev) => {
      if (prev.length === 0) return prev
      return prev.map((calc) =>
        calc.chargeRows.length > 0 ? calc : { ...calc, chargeRows: defaultRows.map((r) => ({ ...r, id: `${r.id}-${Math.random()}` })) },
      )
    })
  }, [products, editableItems.length, offerId])

  // Auto-resolve extracted location names
  const resolveLocationsForItems = useCallback(async (items: WizardItem[]) => {
    const namesToResolve = new Set<string>()
    for (const item of items) {
      if (item.origin) namesToResolve.add(item.origin)
      if (item.destination) namesToResolve.add(item.destination)
    }
    if (namesToResolve.size === 0) return

    const resolved = new Map<string, { id: string; name: string }>()
    await Promise.all(
      Array.from(namesToResolve).map(async (name) => {
        const loc = await resolveLocation(name)
        if (loc) resolved.set(name, loc)
      }),
    )
    if (!mountedRef.current || resolved.size === 0) return

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
  }, [])

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
          }))

          if (mountedRef.current) {
            setEditableItems(newItems)
            const itemCalcs = result.extraction.items.map(() => ({ chargeRows: [] as ChargeRow[] }))
            setCalculations(itemCalcs.length > 0 ? itemCalcs : [{ chargeRows: [] }])
            setExpandedBoxes(new Set(result.extraction.items.map((_, i) => i)))
            resolveLocationsForItems(newItems)
          }

          // 3. Update RFQ with extracted data (runs regardless of mount state)
          const ext = result.extraction
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
              transportMode: normalizeToLowerEnum(item.transportMode, FMS_TRANSPORT_MODES),
              notes: item.notes || null,
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
  const ensureDraftOffer = useCallback(async () => {
    if (offerIdRef.current || !rfqIdRef.current || draftCreatingRef.current) return
    // Check if draft offer already found from server data
    if (draftOfferRef.current) {
      setOfferId(draftOfferRef.current.id)
      const calc = draftOfferRef.current.calculations[0]
      if (calc) setCalculationId(calc.id)
      return
    }
    draftCreatingRef.current = true
    try {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + 30)
      const firstItem = editableItemsRef.current[0]
      const offerRes = await apiCall<{ id: string; calculations?: Array<{ id: string }> }>('/api/fms_offers/offers', {
        method: 'POST',
        body: JSON.stringify({
          rfqId: rfqIdRef.current,
          validUntil: validUntil.toISOString(),
          transportMode: firstItem?.transportMode || null,
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
        const calcId = offer.calculations?.[0]?.id || null
        if (calcId) setCalculationId(calcId)
      }
    } catch (err) {
      console.error('[RfqWizard] Error creating draft offer:', err)
    } finally {
      draftCreatingRef.current = false
    }
  }, []) // stable — uses refs internally

  // Auto-create draft offer when on pricing step with rfqId but no offerId
  useEffect(() => {
    if (step >= 1 && rfqId && !offerId && !draftCreatingRef.current) {
      ensureDraftOffer()
    }
  }, [step, rfqId, offerId, ensureDraftOffer])

  // Sync charge row changes to server (debounced)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncChargeRow = useCallback((index: number, rows: ChargeRow[]) => {
    setCalculations((prev) =>
      prev.map((calc, i) => (i === index ? { ...calc, chargeRows: rows } : calc)),
    )

    // Debounce server sync
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      if (!calculationId) return
      // Sync each row
      for (const row of rows) {
        const isNew = row.id.startsWith('new-')
        const lineData = {
          calculationId,
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
          const res = await apiCall<{ id: string }>('/api/fms_offers/offer-lines', {
            method: 'POST',
            body: JSON.stringify(lineData),
            headers: { 'Content-Type': 'application/json' },
          })
          if (res.ok && res.result?.id) {
            // Replace temp id with server id
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
    }, 500)
  }, [calculationId])

  // Delete a charge row from server
  const deleteChargeRow = useCallback(async (rowId: string) => {
    if (!rowId.startsWith('new-')) {
      await apiCall(`/api/fms_offers/offer-lines/${rowId}`, { method: 'DELETE' })
    }
  }, [])

  const updateCalculation = useCallback((index: number, chargeRows: ChargeRow[]) => {
    // Find deleted rows for server cleanup
    const prev = calculationsRef.current[index]?.chargeRows || []
    const newIds = new Set(chargeRows.map((r) => r.id))
    for (const row of prev) {
      if (!newIds.has(row.id)) deleteChargeRow(row.id)
    }

    if (offerId && calculationId) {
      syncChargeRow(index, chargeRows)
    } else {
      setCalculations((p) =>
        p.map((calc, i) => (i === index ? { ...calc, chargeRows } : calc)),
      )
    }
  }, [offerId, calculationId, syncChargeRow, deleteChargeRow])

  const updateItem = useCallback((index: number, patch: Partial<WizardItem>) => {
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
    setEditableItems((prev) => [...prev, makeEmptyItem()])
    setCalculations((prev) => [...prev, { chargeRows: defaultRows }])
    setExpandedBoxes((prev) => {
      const next = new Set(prev)
      next.add(editableItems.length)
      return next
    })
    setEditingItems((prev) => {
      const next = new Set(prev)
      next.add(editableItems.length)
      return next
    })
  }, [products, editableItems.length])

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

  // Send offer
  const handleSend = useCallback(async () => {
    if (!rfqId || sending) return
    setSending(true)
    try {
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
  }, [rfqId, sending, offerId, editableItems, calculations, extraction, queryClient])

  // Reset all state
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
    setEditableItems([])
    setCalculations([])
    setOfferId(null)
    setCalculationId(null)
    setExpandedBoxes(new Set())
    setEditingItems(new Set())
    setExpandedPol(new Set())
    setExpandedPod(new Set())
    setImportDialogItem(null)
    setHistoryDialogItem(null)
    setExpandedOffers(new Set())
    setViewingOfferId(null)
    draftCreatingRef.current = false
    rfqDetailInitRef.current = null
  }, [])

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
    calculationId,
    existingOffers,

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
    handleSend,
    reset,

    // Data
    rfqDetail,
  }
}
