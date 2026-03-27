'use client'

import * as React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import {
  ArrowLeft,
  Check,
  Save,
  Ship,
} from 'lucide-react'

interface RouteParams {
  params?: { id?: string }
}

interface LineItem {
  id: string
  lineNumber: number
  description: string
  quantity: string
  unit: string | null
  netAmount: string
  grossAmount: string
  sourceLineItemId: string | null
}

interface InvoicingInvoice {
  id: string
  invoiceNumber: string | null
  currencyCode: string
  grossAmount: string
  netAmount: string
  status: string
  sourceDocumentInvoiceId: string | null
  lineItems: LineItem[]
}

interface ProjectLine {
  id: string
  lineNumber: number
  productName: string
  chargeCode: string | null
  chargeCategory: string | null
  containerSize: string | null
  quantity: string
  currencyCode: string
  soldUnitPrice: string
  soldAmount: string
  estimatedCost: string | null
  actualCost: string | null
  invoicedCost: string | null
}

interface MatchedProject {
  projectId: string
  projectNumber: string
  clientName: string | null
  currentStep: string | null
  matchedBy: string[]
  lines: ProjectLine[]
}

interface Allocation {
  id: string
  invoiceLineItemId: string
  projectId: string
  projectLineId: string
  amount: string
  currencyCode: string
  status: string
}

interface PendingAllocation {
  projectId: string
  projectLineId: string
}

const PROJECT_COLORS = [
  'border-l-teal-500',
  'border-l-blue-500',
  'border-l-pink-500',
  'border-l-amber-500',
  'border-l-violet-500',
  'border-l-emerald-500',
]

const PROJECT_BG_COLORS = [
  'bg-teal-50',
  'bg-blue-50',
  'bg-pink-50',
  'bg-amber-50',
  'bg-violet-50',
  'bg-emerald-50',
]

const formatCurrency = (value: string | number | null | undefined, currency: string = 'PLN') => {
  if (value == null) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export default function AllocateCostsPage({ params }: RouteParams) {
  const invoicingId = params?.id
  const router = useRouter()
  const queryClient = useQueryClient()

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedProjectLineId, setSelectedProjectLineId] = useState<string | null>(null)
  const [pendingAllocations, setPendingAllocations] = useState<Map<string, PendingAllocation>>(new Map())

  // Load invoicing invoice (for line items + sourceDocumentInvoiceId)
  const { data: invoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoicing-invoice', invoicingId],
    queryFn: async (): Promise<InvoicingInvoice> => {
      const { result } = await apiCall(`/api/invoicing/invoices/${invoicingId}`)
      return result as unknown as InvoicingInvoice
    },
  })

  const sourceDocInvoiceId = invoice?.sourceDocumentInvoiceId

  // Load matched projects from FMS
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['fms-invoice-project-lines', sourceDocInvoiceId],
    queryFn: async (): Promise<{ projects: MatchedProject[] }> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}/project-lines`)
      return result as unknown as { projects: MatchedProject[] }
    },
    enabled: !!sourceDocInvoiceId,
  })

  // Load existing allocations from FMS
  const { data: allocationsData } = useQuery({
    queryKey: ['fms-invoice-allocations', sourceDocInvoiceId],
    queryFn: async (): Promise<{ allocations: Allocation[] }> => {
      const { result } = await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}/allocations`)
      return result as unknown as { allocations: Allocation[] }
    },
    enabled: !!sourceDocInvoiceId,
  })

  const projects = projectsData?.projects ?? []
  const savedAllocations = allocationsData?.allocations ?? []

  // Build line item ID map: invoicing line item id -> fms line item id
  const sourceLineItemMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const li of invoice?.lineItems ?? []) {
      if (li.sourceLineItemId) {
        map.set(li.id, li.sourceLineItemId)
      }
    }
    return map
  }, [invoice])

  // Build reverse map: fms line item id -> invoicing line item id
  const reverseLineItemMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const li of invoice?.lineItems ?? []) {
      if (li.sourceLineItemId) {
        map.set(li.sourceLineItemId, li.id)
      }
    }
    return map
  }, [invoice])

  const activeLineItems = useMemo(
    () => invoice?.lineItems ?? [],
    [invoice]
  )

  // Build saved allocation map keyed by invoicing line item id
  const savedAllocationMap = useMemo(() => {
    const map = new Map<string, Allocation>()
    for (const a of savedAllocations) {
      const invoicingLineItemId = reverseLineItemMap.get(a.invoiceLineItemId)
      if (invoicingLineItemId) {
        map.set(invoicingLineItemId, a)
      }
    }
    return map
  }, [savedAllocations, reverseLineItemMap])

  const allocatedCount = savedAllocationMap.size + pendingAllocations.size

  const handleLineItemClick = useCallback((lineItemId: string) => {
    if (savedAllocationMap.has(lineItemId)) return
    if (!selectedProjectId || !selectedProjectLineId) return

    setPendingAllocations((prev) => {
      const next = new Map(prev)
      if (next.has(lineItemId) && next.get(lineItemId)!.projectLineId === selectedProjectLineId) {
        next.delete(lineItemId)
      } else {
        next.set(lineItemId, {
          projectId: selectedProjectId,
          projectLineId: selectedProjectLineId,
        })
      }
      return next
    })
  }, [selectedProjectId, selectedProjectLineId, savedAllocationMap])

  const handleProjectLineSelect = useCallback((projectId: string, lineId: string) => {
    if (selectedProjectId === projectId && selectedProjectLineId === lineId) {
      setSelectedProjectId(null)
      setSelectedProjectLineId(null)
    } else {
      setSelectedProjectId(projectId)
      setSelectedProjectLineId(lineId)
    }
  }, [selectedProjectId, selectedProjectLineId])

  // Save allocations via FMS API using mapped FMS line item IDs
  const saveMutation = useMutation({
    mutationFn: async () => {
      const allocations = Array.from(pendingAllocations.entries()).map(([invoicingLineItemId, target]) => {
        const lineItem = activeLineItems.find((li) => li.id === invoicingLineItemId)
        const fmsLineItemId = sourceLineItemMap.get(invoicingLineItemId)
        return {
          lineItemId: fmsLineItemId ?? invoicingLineItemId,
          projectId: target.projectId,
          projectLineId: target.projectLineId,
          amount: lineItem?.grossAmount ?? '0',
          currencyCode: invoice?.currencyCode ?? 'PLN',
        }
      })

      const { result } = await apiCall(`/api/fms_documents/invoices/${sourceDocInvoiceId}/allocations`, {
        method: 'POST',
        body: JSON.stringify({ allocations }),
      })
      return result
    },
    onSuccess: () => {
      setPendingAllocations(new Map())
      queryClient.invalidateQueries({ queryKey: ['fms-invoice-allocations', sourceDocInvoiceId] })
      queryClient.invalidateQueries({ queryKey: ['fms-invoice-project-lines', sourceDocInvoiceId] })
    },
  })

  const getProjectColorIndex = useCallback((projectId: string) => {
    const idx = projects.findIndex((p) => p.projectId === projectId)
    return idx >= 0 ? idx % PROJECT_COLORS.length : 0
  }, [projects])

  if (invoiceLoading || projectsLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-muted-foreground">
        Invoice not found
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Tab bar */}
      <div className="flex-shrink-0 border-b bg-background">
        <div className="flex items-center px-6 py-0">
          <button
            className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/backend/invoicing/${invoicingId}/verify`)}
          >
            1. Verify invoice
          </button>
          <button
            className="px-4 py-3 text-sm font-medium border-b-2 border-primary text-primary"
          >
            2. Allocate costs
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel - Projects & offer lines */}
        <div className="flex-1 flex flex-col min-w-0 border-r">
          <div className="flex-shrink-0 px-6 py-3 border-b bg-background">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Projects</h2>
                <Badge variant="secondary">{projects.length}</Badge>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {projects.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <Ship className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No matching projects found</p>
                <p className="text-xs mt-1">Projects are matched by B/L number, booking reference, or MBL number</p>
              </div>
            )}

            {projects.map((project, projectIdx) => {
              const colorIdx = projectIdx % PROJECT_COLORS.length
              const isActiveProject = selectedProjectId === project.projectId

              return (
                <div
                  key={project.projectId}
                  className={`rounded-lg border-2 border-l-4 ${PROJECT_COLORS[colorIdx]} ${
                    isActiveProject ? 'border-primary/30' : 'border-border'
                  }`}
                >
                  {/* Project header */}
                  <div className="px-4 py-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">{project.projectNumber}</span>
                        {project.matchedBy.map((m) => (
                          <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                        ))}
                      </div>
                      {isActiveProject && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                          ASSIGNING
                        </Badge>
                      )}
                    </div>
                    {project.clientName && (
                      <div className="text-xs text-muted-foreground mt-1">{project.clientName}</div>
                    )}
                  </div>

                  {/* Project lines table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/20 text-muted-foreground">
                          <th className="text-left px-3 py-1.5 font-medium">Description</th>
                          <th className="text-left px-3 py-1.5 font-medium">Ccy</th>
                          <th className="text-right px-3 py-1.5 font-medium">Buy</th>
                          <th className="text-right px-3 py-1.5 font-medium">Sell</th>
                          <th className="text-right px-3 py-1.5 font-medium">Inv. Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.lines.map((line) => {
                          const isSelected = selectedProjectLineId === line.id && selectedProjectId === project.projectId
                          return (
                            <tr
                              key={line.id}
                              onClick={() => handleProjectLineSelect(project.projectId, line.id)}
                              className={`border-t cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-primary/10 ring-1 ring-inset ring-primary/20'
                                  : 'hover:bg-muted/30'
                              }`}
                            >
                              <td className="px-3 py-2">
                                <div className="font-medium">{line.productName}</div>
                                {line.chargeCode && (
                                  <div className="text-muted-foreground">{line.chargeCode}</div>
                                )}
                              </td>
                              <td className="px-3 py-2">{line.currencyCode}</td>
                              <td className="px-3 py-2 text-right font-mono">
                                {formatCurrency(line.actualCost ?? line.estimatedCost, line.currencyCode)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {formatCurrency(line.soldAmount, line.currencyCode)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {line.invoicedCost ? (
                                  <span className="text-emerald-600 font-medium">
                                    {formatCurrency(line.invoicedCost, line.currencyCode)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right panel - Invoice cost lines */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-shrink-0 px-6 py-3 border-b bg-background">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Invoice costs</h2>
                {invoice.invoiceNumber && (
                  <Badge variant="outline" className="font-mono text-xs">{invoice.invoiceNumber}</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {allocatedCount}/{activeLineItems.length} allocated
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!selectedProjectLineId && (
              <div className="text-sm text-muted-foreground mb-4 p-3 bg-muted/30 rounded-lg">
                Select an offer line from a project on the left, then click cost lines below to assign them.
              </div>
            )}

            {selectedProjectLineId && (
              <div className="text-sm text-primary mb-4 p-3 bg-primary/5 rounded-lg border border-primary/10">
                Click rows below to assign to the selected offer line.
              </div>
            )}

            <div className="space-y-2">
              {activeLineItems.map((li) => {
                const savedAlloc = savedAllocationMap.get(li.id)
                const pendingAlloc = pendingAllocations.get(li.id)
                const isSaved = !!savedAlloc
                const isPending = !!pendingAlloc

                let cardClass = 'border rounded-lg p-3 transition-all '
                let bgClass = ''

                if (isSaved) {
                  cardClass += 'border-emerald-200 cursor-default '
                  bgClass = 'bg-emerald-50/50'
                } else if (isPending) {
                  const colorIdx = getProjectColorIndex(pendingAlloc.projectId)
                  cardClass += `border-l-4 ${PROJECT_COLORS[colorIdx]} cursor-pointer `
                  bgClass = PROJECT_BG_COLORS[colorIdx]
                } else {
                  cardClass += 'border-border cursor-pointer hover:border-muted-foreground/30 '
                }

                return (
                  <div
                    key={li.id}
                    className={`${cardClass} ${bgClass}`}
                    onClick={() => !isSaved && handleLineItemClick(li.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{li.description}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {li.quantity} &middot; {formatCurrency(li.grossAmount, invoice.currencyCode)}
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-3">
                        {isSaved && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Saved
                          </Badge>
                        )}
                        {isPending && (
                          <Badge variant="outline" className="text-xs">
                            Assigned
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isPending && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs">
                          {projects.find((p) => p.projectId === pendingAlloc.projectId)?.projectNumber ?? 'Project'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">→</span>
                        <Badge variant="secondary" className="text-xs">
                          {projects
                            .find((p) => p.projectId === pendingAlloc.projectId)
                            ?.lines.find((l) => l.id === pendingAlloc.projectLineId)
                            ?.productName ?? 'Line'}
                        </Badge>
                      </div>
                    )}
                    {isSaved && savedAlloc && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs bg-emerald-50">
                          {projects.find((p) => p.projectId === savedAlloc.projectId)?.projectNumber ?? 'Project'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">→</span>
                        <Badge variant="secondary" className="text-xs bg-emerald-50">
                          {projects
                            .find((p) => p.projectId === savedAlloc.projectId)
                            ?.lines.find((l) => l.id === savedAlloc.projectLineId)
                            ?.productName ?? 'Line'}
                        </Badge>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Total */}
            <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
              <span className="font-medium">Total: {invoice.currencyCode}</span>
              <span className="font-mono font-semibold">
                {formatCurrency(invoice.grossAmount, invoice.currencyCode)}
              </span>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex-shrink-0 border-t bg-background px-6 py-3">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => router.push(`/backend/invoicing/${invoicingId}/verify`)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={pendingAllocations.size === 0 || saveMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                Save allocation ({pendingAllocations.size})
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
