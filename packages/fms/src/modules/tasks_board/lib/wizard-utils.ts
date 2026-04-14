import type { ChargeRow } from '../components/ChargesTable'
import type { ProductItem, WizardItem } from './wizard-types'
import { mapProductChargeUnit, resolveLocation } from './wizard-types'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

/** Create default charge rows from products catalog */
export function buildDefaultChargeRows(products: ProductItem[], isEnabled = true): ChargeRow[] {
  return products.map((product, index) => ({
    id: `new-${Date.now()}-${index}-${Math.random()}`,
    productId: product.id,
    productName: product.name || 'Unnamed Product',
    chargeCode: product.chargeCode || '',
    chargeBasis: mapProductChargeUnit(product.chargeUnit),
    containerType: null,
    currencyCode: 'USD',
    rate: 0,
    marginPercent: 0,
    buyPrice: 0,
    sellPrice: 0,
    quantity: 1,
    isEnabled,
    sectionType: product.defaultSectionType || 'main_freight',
  }))
}

/** Re-index Set<number> indices after removing an item at `removedIndex` */
export function reindexSet(prev: Set<number>, removedIndex: number): Set<number> {
  const next = new Set<number>()
  for (const idx of prev) {
    if (idx < removedIndex) next.add(idx)
    else if (idx > removedIndex) next.add(idx - 1)
  }
  return next
}

/** Auto-resolve location names to IDs for a single item patch */
export async function resolveItemLocations(
  patch: Partial<WizardItem>,
  index: number,
  mountedRef: React.MutableRefObject<boolean>,
  setEditableItems: React.Dispatch<React.SetStateAction<WizardItem[]>>,
): Promise<void> {
  const shouldResolveOrigin = patch.origin && !patch.originLocationId
  const shouldResolveDest = patch.destination && !patch.destinationLocationId
  if (!shouldResolveOrigin && !shouldResolveDest) return

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
}

/** Sync offer-level and calculation-level fields to server */
export async function saveItemFieldsToServer(
  offerId: string,
  items: WizardItem[],
  calculationIds: string[],
): Promise<void> {
  if (items.length === 0) return
  const firstItem = items[0]

  const allCarrierIds = items.flatMap((item) => item.carrierIds || [])
  const allProviderIds = items.flatMap((item) => item.providerIds || [])
  const offerPayload = {
    carrierIds: allCarrierIds.length > 0 ? allCarrierIds : null,
    providerIds: allProviderIds.length > 0 ? allProviderIds : null,
    incoterm: firstItem?.incoterm || null,
    transportMode: firstItem?.transportMode || null,
    customerNotes: firstItem?.cargoDescription || null,
  }
  await apiCall(`/api/fms_offers/offers/${offerId}`, {
    method: 'PUT',
    body: JSON.stringify(offerPayload),
    headers: { 'Content-Type': 'application/json' },
  })

  for (let i = 0; i < items.length; i++) {
    const calcId = calculationIds[i]
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
}

/** Create a server-side calculation for a new item */
export async function createCalculationForItem(
  offerId: string,
  itemIndex: number,
  item?: WizardItem,
): Promise<string | null> {
  const calcRes = await apiCall<{ id: string }>('/api/fms_offers/calculations', {
    method: 'POST',
    body: JSON.stringify({
      offerId,
      label: `Route ${itemIndex + 1}`,
      originLocationId: item?.originLocationId || null,
      destinationLocationId: item?.destinationLocationId || null,
      placeOfLoadingId: item?.placeOfLoadingId || null,
      placeOfDeliveryId: item?.placeOfDeliveryId || null,
    }),
    headers: { 'Content-Type': 'application/json' },
  })
  return calcRes.ok && calcRes.result?.id ? calcRes.result.id : null
}

/** Resolve location names from IDs for a set of items */
export async function resolveLocationNamesFromIds(
  items: WizardItem[],
  mountedRef: React.MutableRefObject<boolean>,
  setEditableItems: React.Dispatch<React.SetStateAction<WizardItem[]>>,
): Promise<void> {
  const locationIdsToResolve = new Set<string>()
  for (const it of items) {
    if (it.originLocationId) locationIdsToResolve.add(it.originLocationId)
    if (it.destinationLocationId) locationIdsToResolve.add(it.destinationLocationId)
  }
  if (locationIdsToResolve.size === 0) return

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
}

/** Resolve carrier and provider names from IDs */
export async function resolveCarrierProviderNames(
  carrierIds: string[],
  providerIds: string[],
  mountedRef: React.MutableRefObject<boolean>,
  setEditableItems: React.Dispatch<React.SetStateAction<WizardItem[]>>,
): Promise<void> {
  if (carrierIds.length > 0) {
    const names: string[] = []
    for (const cid of carrierIds) {
      const cRes = await apiCall<{ id: string; name: string }>(`/api/fms_products/carriers/${cid}`)
      names.push(cRes.result?.name || cid)
    }
    if (mountedRef.current) {
      setEditableItems((prev) => prev.map((it, idx) => idx === 0 ? { ...it, carrierNames: names } : it))
    }
  }
  if (providerIds.length > 0) {
    const names: string[] = []
    for (const pid of providerIds) {
      const pRes = await apiCall<{ id: string; name: string }>(`/api/contractors/contractors/${pid}`)
      names.push(pRes.result?.name || pid)
    }
    if (mountedRef.current) {
      setEditableItems((prev) => prev.map((it, idx) => idx === 0 ? { ...it, providerNames: names } : it))
    }
  }
}
