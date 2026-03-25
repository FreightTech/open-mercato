'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, FileEdit, Link2, LinkIcon } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { FileLinesTable, type FileLine } from './FileLinesTable'
import { AddManualLineDialog, type NewFileLineData } from './AddManualLineDialog'
import { AddFileProductDialog } from './AddFileProductDialog'
import { LinkFileOfferDialog } from './LinkFileOfferDialog'
import { FileDocumentCostsSection } from './FileDocumentCostsSection'
import { FileInvoiceCostsSection } from './FileInvoiceCostsSection'

type FileCostsDrawerProps = {
  fileId: string
  offerId: string | null
  currencyCode: string
  open: boolean
  onClose: () => void
}

function calculateTotals(lines: FileLine[]) {
  let estCost = 0
  let actualCost = 0
  let estSell = 0
  let actualSell = 0

  for (const line of lines) {
    estCost += parseFloat(line.estimatedCost ?? '0') || 0
    actualCost += parseFloat(line.actualCost ?? '0') || 0
    estSell += parseFloat(line.soldAmount ?? '0') || 0
    actualSell += parseFloat(line.actualSellAmount ?? '0') || 0
  }

  const margin = actualSell - actualCost
  const marginPct = actualSell > 0 ? (margin / actualSell) * 100 : 0
  return { estCost, actualCost, estSell, actualSell, margin, marginPct }
}

function fmt(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function FileCostsDrawer({ fileId, offerId, currencyCode, open, onClose }: FileCostsDrawerProps) {
  const queryClient = useQueryClient()
  const [showManualLineDialog, setShowManualLineDialog] = useState(false)
  const [showAddProductDialog, setShowAddProductDialog] = useState(false)
  const [showLinkOfferDialog, setShowLinkOfferDialog] = useState(false)
  const [linkedOfferId, setLinkedOfferId] = useState<string | null>(offerId)

  useEffect(() => {
    setLinkedOfferId(offerId)
  }, [offerId])

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['fms_file_lines', fileId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(`/api/fms_files/files/${fileId}/lines`)
      if (!response.ok) return []
      return (response.result?.items || []).map((line: any) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        sourceOfferLineId: line.sourceOfferLineId,
        sourceType: line.sourceType || 'manual',
        productId: line.productId || null,
        priceId: line.priceId || null,
        productName: line.productName,
        chargeCode: line.chargeCode,
        chargeCategory: line.chargeCategory || null,
        chargeUnit: line.chargeUnit || null,
        containerSize: line.containerSize,
        containerType: line.containerType || null,
        quantity: line.quantity || '1',
        currencyCode: line.currencyCode || 'USD',
        soldUnitPrice: line.soldUnitPrice || '0',
        soldAmount: line.soldAmount || '0',
        estimatedUnitCost: line.estimatedUnitCost || null,
        estimatedCost: line.estimatedCost || null,
        actualUnitCost: line.actualUnitCost || null,
        actualCost: line.actualCost || null,
        actualSellUnitPrice: line.actualSellUnitPrice || null,
        actualSellAmount: line.actualSellAmount || null,
        notes: line.notes,
      })) as FileLine[]
    },
    enabled: !!fileId && open,
  })

  const totals = useMemo(() => calculateTotals(lines), [lines])

  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, field, value }: { lineId: string; field: string; value: unknown }) => {
      const response = await apiCall(`/api/fms_files/files/${fileId}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lineId, [field]: value }),
      })
      if (!response.ok) throw new Error('Failed to update line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_file_lines', fileId] })
    },
    onError: (err) => {
      flash(err instanceof Error ? err.message : 'Failed to update line', 'error')
    },
  })

  const addLineMutation = useMutation({
    mutationFn: async (lineData: NewFileLineData) => {
      const response = await apiCall(`/api/fms_files/files/${fileId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: lineData.productName,
          chargeCode: lineData.chargeCode,
          containerSize: lineData.containerSize,
          quantity: String(lineData.quantity),
          soldUnitPrice: String(lineData.soldUnitPrice),
          estimatedUnitCost: lineData.estimatedUnitCost != null ? String(lineData.estimatedUnitCost) : null,
          currencyCode: lineData.currencyCode,
          notes: lineData.notes,
        }),
      })
      if (!response.ok) throw new Error('Failed to add line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_file_lines', fileId] })
    },
    onError: (err) => {
      flash(err instanceof Error ? err.message : 'Failed to add line', 'error')
    },
  })

  const removeLineMutation = useMutation({
    mutationFn: async (lineId: string) => {
      const response = await apiCall(`/api/fms_files/files/${fileId}/lines?id=${lineId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to remove line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_file_lines', fileId] })
    },
    onError: (err) => {
      flash(err instanceof Error ? err.message : 'Failed to remove line', 'error')
    },
  })

  const unlinkOfferMutation = useMutation({
    mutationFn: async () => {
      const response = await apiCall(`/api/fms_files/files/${fileId}/unlink-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error('Failed to unlink offer')
      return response.result
    },
    onSuccess: () => {
      setLinkedOfferId(null)
      queryClient.invalidateQueries({ queryKey: ['fms_file_lines', fileId] })
      queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })
      flash('Offer unlinked', 'success')
    },
    onError: (err) => {
      flash(err instanceof Error ? err.message : 'Failed to unlink offer', 'error')
    },
  })

  const handleLineUpdate = useCallback(
    async (lineId: string, field: string, value: unknown) => {
      await updateLineMutation.mutateAsync({ lineId, field, value })
    },
    [updateLineMutation]
  )

  const handleAddManualLine = useCallback(
    async (lineData: NewFileLineData) => {
      await addLineMutation.mutateAsync(lineData)
    },
    [addLineMutation]
  )

  const handleRemoveLine = useCallback(
    async (lineId: string) => {
      await removeLineMutation.mutateAsync(lineId)
    },
    [removeLineMutation]
  )

  const handleOfferLinked = useCallback(
    (newOfferId: string) => {
      setLinkedOfferId(newOfferId)
      queryClient.invalidateQueries({ queryKey: ['fms_file_lines', fileId] })
      queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })
    },
    [queryClient, fileId]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  const buttonsContent = (
    <div className="flex items-center gap-2">
      {linkedOfferId ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => unlinkOfferMutation.mutate()}
          disabled={unlinkOfferMutation.isPending}
        >
          <LinkIcon className="h-4 w-4 mr-1" />
          Unlink Offer
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowLinkOfferDialog(true)}>
          <Link2 className="h-4 w-4 mr-1" />
          Link Offer
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setShowAddProductDialog(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Add Product
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setShowManualLineDialog(true)}>
        <FileEdit className="h-4 w-4 mr-1" />
        Manual Line
      </Button>
    </div>
  )

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-y-0 right-0 bg-background border-l shadow-xl z-50 flex flex-col"
        style={{ width: '100vw', maxWidth: '1200px' }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Costs & Lines</h2>
            <Badge variant="secondary">{lines.length}</Badge>
            {linkedOfferId && (
              <Badge variant="outline" className="text-xs">
                <Link2 className="h-3 w-3 mr-1" />
                Offer Linked
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Summary row */}
          {lines.length > 0 && (
            <div className="border rounded-lg">
              <div className="px-3 py-1.5 border-b">
                <h3 className="text-sm font-medium">Summary ({currencyCode})</h3>
              </div>
              <div className="grid grid-cols-5 divide-x text-sm">
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Est. Cost</p>
                  <p className="font-mono font-medium">{fmt(totals.estCost, currencyCode)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Actual Cost</p>
                  <p className={`font-mono font-medium ${totals.actualCost > 0 ? 'text-red-600' : ''}`}>
                    {fmt(totals.actualCost, currencyCode)}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Est. Sell</p>
                  <p className="font-mono font-medium">{fmt(totals.estSell, currencyCode)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Actual Sell</p>
                  <p className="font-mono font-medium">{fmt(totals.actualSell, currencyCode)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Margin</p>
                  <p className={`font-mono font-medium ${totals.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt(totals.margin, currencyCode)}{' '}
                    <span className="text-xs">({totals.marginPct.toFixed(1)}%)</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Lines table */}
          <div className="border rounded-lg">
            <div className="px-3 py-1.5 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Lines</span>
                <Badge variant="secondary" className="text-xs">{lines.length}</Badge>
              </div>
              {buttonsContent}
            </div>
            <FileLinesTable
              lines={lines}
              isLoading={isLoading}
              onLineUpdate={handleLineUpdate}
              onRemoveLine={handleRemoveLine}
              currencyCode={currencyCode}
            />
          </div>

          {/* Linked documents with extracted line items */}
          <FileDocumentCostsSection fileId={fileId} />

          {/* AI-extracted invoices with review workflow */}
          <FileInvoiceCostsSection
            fileId={fileId}
            estimatedCost={totals.estCost}
            currencyCode={currencyCode}
          />
        </div>
      </div>

      <AddManualLineDialog
        open={showManualLineDialog}
        onOpenChange={setShowManualLineDialog}
        onAdd={handleAddManualLine}
      />

      <AddFileProductDialog
        open={showAddProductDialog}
        onOpenChange={setShowAddProductDialog}
        onAdd={handleAddManualLine}
        currencyCode={currencyCode}
      />

      <LinkFileOfferDialog
        open={showLinkOfferDialog}
        onOpenChange={setShowLinkOfferDialog}
        fileId={fileId}
        onOfferLinked={handleOfferLinked}
      />
    </>
  )
}
