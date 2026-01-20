'use client'

import * as React from 'react'
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { ChevronDown, ChevronRight, Package, Plus, Link2, FileEdit } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ProjectLinesTable, type ProjectLine } from './ProjectLinesTable'
import { AddManualLineDialog, type NewProjectLineData } from './AddManualLineDialog'
import { LinkOfferDialog } from './LinkOfferDialog'
import { AddProjectProductDialog } from './AddProjectProductDialog'

type ProjectFinancialSectionProps = {
  projectId: string
  offerId: string | null
  currencyCode: string
  onError?: (error: string) => void
}

export function ProjectFinancialSection({
  projectId,
  offerId,
  currencyCode,
  onError,
}: ProjectFinancialSectionProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(true)
  const [showManualLineDialog, setShowManualLineDialog] = useState(false)
  const [showLinkOfferDialog, setShowLinkOfferDialog] = useState(false)
  const [showAddProductDialog, setShowAddProductDialog] = useState(false)
  const [linkedOfferId, setLinkedOfferId] = useState<string | null>(offerId)

  // Fetch project lines
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['fms_project_lines', projectId],
    queryFn: async () => {
      const response = await apiCall<{ items: any[] }>(
        `/api/fms_projects/projects/${projectId}/lines`
      )
      if (!response.ok) return []
      return (response.result?.items || []).map((line: any) => ({
        id: line.id,
        lineNumber: line.line_number,
        sourceOfferLineId: line.source_offer_line_id,
        sourceType: line.source_type || 'manual',
        productName: line.product_name,
        chargeCode: line.charge_code,
        containerSize: line.container_size,
        quantity: line.quantity || '1',
        currencyCode: line.currency_code || 'USD',
        soldUnitPrice: line.sold_unit_price || '0',
        soldAmount: line.sold_amount || '0',
        actualUnitCost: line.actual_unit_cost,
        actualCost: line.actual_cost,
        notes: line.notes,
      })) as ProjectLine[]
    },
    enabled: !!projectId,
  })

  // Update line mutation
  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, field, value }: { lineId: string; field: string; value: unknown }) => {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/lines/${lineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!response.ok) throw new Error('Failed to update line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_project_lines', projectId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to update line')
    },
  })

  // Add line mutation
  const addLineMutation = useMutation({
    mutationFn: async (lineData: NewProjectLineData) => {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: lineData.productName,
          chargeCode: lineData.chargeCode,
          containerSize: lineData.containerSize,
          quantity: lineData.quantity,
          soldUnitPrice: lineData.soldUnitPrice,
          currencyCode: lineData.currencyCode,
          notes: lineData.notes,
          sourceType: 'manual',
        }),
      })
      if (!response.ok) throw new Error('Failed to add line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_project_lines', projectId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to add line')
    },
  })

  // Remove line mutation
  const removeLineMutation = useMutation({
    mutationFn: async (lineId: string) => {
      const response = await apiCall(`/api/fms_projects/projects/${projectId}/lines/${lineId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to remove line')
      return response.result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fms_project_lines', projectId] })
    },
    onError: (err) => {
      onError?.(err instanceof Error ? err.message : 'Failed to remove line')
    },
  })

  // Handler for line updates
  const handleLineUpdate = useCallback(
    async (lineId: string, field: string, value: unknown) => {
      await updateLineMutation.mutateAsync({ lineId, field, value })
    },
    [updateLineMutation]
  )

  // Handler for adding a manual line
  const handleAddManualLine = useCallback(
    async (lineData: NewProjectLineData) => {
      await addLineMutation.mutateAsync(lineData)
    },
    [addLineMutation]
  )

  // Handler for adding a product from catalog
  const handleAddProduct = useCallback(
    async (lineData: NewProjectLineData) => {
      await addLineMutation.mutateAsync(lineData)
    },
    [addLineMutation]
  )

  // Handler for removing a line
  const handleRemoveLine = useCallback(
    async (lineId: string) => {
      await removeLineMutation.mutateAsync(lineId)
    },
    [removeLineMutation]
  )

  // Handler for linking offer
  const handleOfferLinked = useCallback(
    (newOfferId: string) => {
      setLinkedOfferId(newOfferId)
      queryClient.invalidateQueries({ queryKey: ['fms_project_lines', projectId] })
    },
    [queryClient, projectId]
  )

  // Determine if we can link an offer (only when no offer linked AND no lines)
  const canLinkOffer = !linkedOfferId && lines.length === 0

  // Empty state when no linked offer and no lines
  const showEmptyState = !linkedOfferId && lines.length === 0 && !isLoading

  // Title bar content for the table
  const titleContent = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Products & Costs</span>
        <Badge variant="secondary">{lines.length}</Badge>
      </button>
      {linkedOfferId && (
        <Badge variant="outline" className="text-xs">
          <Link2 className="h-3 w-3 mr-1" />
          Linked
        </Badge>
      )}
    </div>
  )

  // Buttons for the table top bar
  const buttonsContent = (
    <div className="flex items-center gap-2">
      {canLinkOffer && (
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

  return (
    <div className="border rounded-lg">
      <ProjectLinesTable
        lines={lines}
        isLoading={isLoading}
        onLineUpdate={handleLineUpdate}
        onRemoveLine={handleRemoveLine}
        currencyCode={currencyCode}
        titleContent={titleContent}
        buttonsContent={buttonsContent}
        expanded={expanded}
        showEmptyState={showEmptyState}
        onShowLinkOffer={() => setShowLinkOfferDialog(true)}
        onShowAddProduct={() => setShowAddProductDialog(true)}
      />

      {/* Add manual line dialog */}
      <AddManualLineDialog
        open={showManualLineDialog}
        onOpenChange={setShowManualLineDialog}
        onAdd={handleAddManualLine}
      />

      {/* Link offer dialog */}
      <LinkOfferDialog
        open={showLinkOfferDialog}
        onOpenChange={setShowLinkOfferDialog}
        projectId={projectId}
        onOfferLinked={handleOfferLinked}
      />

      {/* Add product from catalog dialog */}
      <AddProjectProductDialog
        open={showAddProductDialog}
        onOpenChange={setShowAddProductDialog}
        onAdd={handleAddProduct}
        currencyCode={currencyCode}
      />
    </div>
  )
}
