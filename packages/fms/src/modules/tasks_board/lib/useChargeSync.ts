import { useCallback, useRef } from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ChargeRow } from '../components/ChargesTable'
import { FMS_CHARGE_UNITS } from '../../fms_offers/data/types'

type UseChargeSyncInput = {
  calculationIdsRef: React.MutableRefObject<string[]>
  calculationsRef: React.MutableRefObject<Array<{ chargeRows: ChargeRow[] }>>
  setCalculations: React.Dispatch<React.SetStateAction<Array<{ chargeRows: ChargeRow[] }>>>
  offerIdRef: React.MutableRefObject<string | null>
}

/**
 * Shared charge row sync engine for offer wizards.
 * Handles debounced syncing of charge rows to the server, creation of new lines,
 * updating existing lines, deletion tracking, and queuing edits before calcIds are ready.
 */
export function useChargeSync({
  calculationIdsRef,
  calculationsRef,
  setCalculations,
  offerIdRef,
}: UseChargeSyncInput) {
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSyncRef = useRef<{ index: number; rows: ChargeRow[] } | null>(null)
  const deletedClientIdsRef = useRef(new Set<string>())
  const inFlightPostIdsRef = useRef(new Set<string>())
  const pendingLocalEditsRef = useRef<Map<number, ChargeRow[]>>(new Map())

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
        // Skip saving empty placeholder rows (both buy and sell are 0)
        if (!row.buyPrice && !row.sellPrice && !row.rate) continue
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
  }, [calculationIdsRef, setCalculations])

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
  }, [executeSyncForIndex, setCalculations])

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
    if (offerIdRef.current && calculationIdsRef.current[index]) {
      syncChargeRow(index, chargeRows)
    } else {
      pendingLocalEditsRef.current.set(index, chargeRows)
      setCalculations((p) =>
        p.map((calc, i) => (i === index ? { ...calc, chargeRows } : calc)),
      )
    }
  }, [syncChargeRow, deleteChargeRow, setCalculations, calculationsRef, offerIdRef, calculationIdsRef])

  /** Flush all pending debounced syncs and queued edits. */
  const flushChargeSync = useCallback(async () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    pendingSyncRef.current = null

    const flushedIndices = new Set<number>()
    if (pendingLocalEditsRef.current.size > 0) {
      const calcIds = calculationIdsRef.current
      for (const [index, rows] of pendingLocalEditsRef.current) {
        if (calcIds[index]) {
          await executeSyncForIndex(index, rows)
          flushedIndices.add(index)
        }
      }
      pendingLocalEditsRef.current.clear()
    }

    const calcs = calculationsRef.current
    const calcIds = calculationIdsRef.current
    for (let i = 0; i < calcs.length; i++) {
      if (flushedIndices.has(i)) continue
      if (!calcIds[i] || calcs[i].chargeRows.length === 0) continue
      await executeSyncForIndex(i, calcs[i].chargeRows)
    }
  }, [executeSyncForIndex, calculationIdsRef, calculationsRef])

  /** Replay queued edits when calculationIds become available. Call from an effect watching calculationIds. */
  const flushQueuedEdits = useCallback((calculationIds: string[]) => {
    if (calculationIds.length === 0 || pendingLocalEditsRef.current.size === 0) return
    for (const [index, rows] of pendingLocalEditsRef.current) {
      if (calculationIds[index]) {
        executeSyncForIndex(index, rows)
      }
    }
    pendingLocalEditsRef.current.clear()
  }, [executeSyncForIndex])

  /** Clear all sync state (timers, queues, tracking sets). Call on reset or tab switch. */
  const clearSyncState = useCallback(() => {
    if (syncTimerRef.current) { clearTimeout(syncTimerRef.current); syncTimerRef.current = null }
    pendingSyncRef.current = null
    deletedClientIdsRef.current.clear()
    inFlightPostIdsRef.current.clear()
    pendingLocalEditsRef.current.clear()
  }, [])

  return {
    executeSyncForIndex,
    syncChargeRow,
    deleteChargeRow,
    updateCalculation,
    flushChargeSync,
    flushQueuedEdits,
    clearSyncState,
    pendingLocalEditsRef,
  }
}
