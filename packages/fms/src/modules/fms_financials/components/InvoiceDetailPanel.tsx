'use client'

import * as React from 'react'
import { useState, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import {
  Sheet,
  SheetContent,
} from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  DynamicTable,
  TableEvents,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, CellEditSaveEvent, NewRowSaveEvent } from '@open-mercato/ui/backend/dynamic-table'
import {
  CheckCircle,
  FileText,
  Wand2,
  Container,
} from 'lucide-react'
import { LineItemMatcher } from './LineItemMatcher'
import { PagePreview } from './PagePreview'
import { PageThumbnails } from './PageThumbnails'
import { useDrawerTableFocus } from '../../../hooks'

interface InvoiceDetailPanelProps {
  invoiceId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvoiceUpdated?: () => void
  /** Ref to the main table for focus restoration when panel closes */
  mainTableRef?: React.RefObject<HTMLDivElement | null>
}

interface LineItem {
  id: string
  lineNumber: number
  description: string
  quantity: string
  unit: string | null
  unitPriceNet: string
  vatRate: string
  netAmount: string
  vatAmount: string
  grossAmount: string
  productId: string | null
  productName: string | null
  chargeCode: string | null
  chargeCodeMatchConfidence: number | null
}

interface TransportationMetadata {
  blNumber?: string | null
  containerNumbers?: string[]
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  portOfLoading?: string | null
  portOfDischarge?: string | null
  etd?: string | null
  eta?: string | null
  bookingNumber?: string | null
  carrierName?: string | null
  carrierScac?: string | null
}

interface Invoice {
  id: string
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  serviceDate: string | null
  sellerName: string | null
  sellerTaxId: string | null
  sellerAddress: string | null
  buyerName: string | null
  buyerTaxId: string | null
  buyerAddress: string | null
  netAmount: string
  vatAmount: string
  grossAmount: string
  currencyCode: string
  status: string
  extractionConfidence: string | null
  originalFilename: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  documentType: string | null
  documentTypeConfidence: number | null
  blNumber: string | null
  vesselName: string | null
  voyageNumber: string | null
  containerNumbers: string[] | null
  transportationMetadata: TransportationMetadata | null
  customReference: string | null
  lineItems?: LineItem[]
}

interface PagesResponse {
  invoiceId: string
  totalPages: number
}

// Header row for Invoice Header table
interface HeaderRow {
  id: string
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  serviceDate: string | null
  currencyCode: string
}

// References row for linking invoice to projects/shipments
interface ReferencesRow {
  id: string
  blNumber: string | null
  bookingNumber: string | null
  contractor: string | null
  customReference: string | null
}

// Container row for containers table
interface ContainerRow {
  id: string
  containerNumber: string
}

// Party row for Parties table
interface PartyRow {
  id: string
  type: 'Seller' | 'Buyer'
  name: string | null
  taxId: string | null
  address: string | null
}

// Total row for Totals table (horizontal layout)
interface TotalRow {
  id: string
  netAmount: string
  vatAmount: string
  grossAmount: string
}

// Formatters
const formatCurrency = (value: string | number, currency: string = 'PLN') => {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

const formatDate = (date: string | null) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pl-PL')
}

// Column definitions
const getHeaderColumns = (): ColumnDef[] => [
  { data: 'invoiceNumber', title: 'Invoice Number', width: 180, readOnly: false },
  { data: 'invoiceDate', title: 'Invoice Date', width: 130, readOnly: false, type: 'date' },
  { data: 'dueDate', title: 'Due Date', width: 130, readOnly: false, type: 'date' },
  { data: 'serviceDate', title: 'Service Date', width: 130, readOnly: false, type: 'date' },
  { data: 'currencyCode', title: 'Currency', width: 100, readOnly: false },
]

const getReferencesColumns = (): ColumnDef[] => [
  { data: 'blNumber', title: 'B/L Number', width: 180, readOnly: false },
  { data: 'bookingNumber', title: 'Booking No.', width: 180, readOnly: false },
  { data: 'contractor', title: 'Contractor', width: 200, readOnly: false },
  { data: 'customReference', title: 'Custom Reference', width: 250, readOnly: false },
]

const getContainersColumns = (): ColumnDef[] => [
  { data: 'containerNumber', title: 'Container Number', width: 200, readOnly: false },
]

const getPartiesColumns = (): ColumnDef[] => [
  { data: 'type', title: 'Type', width: 80, readOnly: true },
  { data: 'name', title: 'Name', width: 250, readOnly: false },
  { data: 'taxId', title: 'Tax ID (NIP)', width: 150, readOnly: false },
  { data: 'address', title: 'Address', width: 300, readOnly: false },
]

const getTotalsColumns = (currency: string): ColumnDef[] => [
  {
    data: 'netAmount',
    title: 'Net Amount',
    width: 150,
    readOnly: false,
    type: 'numeric',
    renderer: (value: string) => formatCurrency(value, currency),
  },
  {
    data: 'vatAmount',
    title: 'VAT Amount',
    width: 150,
    readOnly: false,
    type: 'numeric',
    renderer: (value: string) => formatCurrency(value, currency),
  },
  {
    data: 'grossAmount',
    title: 'Gross Amount',
    width: 150,
    readOnly: false,
    type: 'numeric',
    renderer: (value: string) => formatCurrency(value, currency),
  },
]

const getLineItemsColumns = (currency: string): ColumnDef[] => [
  { data: 'lineNumber', title: '#', width: 50, readOnly: true, type: 'numeric' },
  { data: 'description', title: 'Description', width: 280, readOnly: false },
  { data: 'quantity', title: 'Qty', width: 80, readOnly: false, type: 'numeric' },
  { data: 'unit', title: 'Unit', width: 60, readOnly: false },
  { data: 'unitPriceNet', title: 'Unit Price', width: 100, readOnly: false, type: 'numeric' },
  { data: 'vatRate', title: 'VAT %', width: 70, readOnly: false, type: 'numeric' },
  {
    data: 'netAmount',
    title: 'Net',
    width: 110,
    readOnly: false,
    type: 'numeric',
    renderer: (value: string) => formatCurrency(value, currency),
  },
  {
    data: 'vatAmount',
    title: 'VAT',
    width: 100,
    readOnly: false,
    type: 'numeric',
    renderer: (value: string) => formatCurrency(value, currency),
  },
  {
    data: 'grossAmount',
    title: 'Gross',
    width: 110,
    readOnly: false,
    type: 'numeric',
    renderer: (value: string) => formatCurrency(value, currency),
  },
  { data: 'chargeCode', title: 'Charge Code', width: 120, readOnly: true },
]

export function InvoiceDetailPanel({
  invoiceId,
  open,
  onOpenChange,
  onInvoiceUpdated,
  mainTableRef,
}: InvoiceDetailPanelProps) {
  const queryClient = useQueryClient()
  const [matchingLineItemId, setMatchingLineItemId] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState(1)

  const headerTableRef = useRef<HTMLDivElement>(null)
  const referencesTableRef = useRef<HTMLDivElement>(null)
  const containersTableRef = useRef<HTMLDivElement>(null)
  const partiesTableRef = useRef<HTMLDivElement>(null)
  const totalsTableRef = useRef<HTMLDivElement>(null)
  const lineItemsTableRef = useRef<HTMLDivElement>(null)

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: async (): Promise<Invoice | null> => {
      if (!invoiceId) return null
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}`)
      return result as unknown as Invoice
    },
    enabled: !!invoiceId && open,
  })

  const { data: pagesData } = useQuery({
    queryKey: ['invoice-pages', invoiceId],
    queryFn: async (): Promise<PagesResponse | null> => {
      if (!invoiceId) return null
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}/pages`)
      return result as unknown as PagesResponse
    },
    enabled: !!invoiceId && open,
  })

  const totalPages = pagesData?.totalPages ?? 0
  const hasPages = totalPages > 0

  const { handleOpenAutoFocus, handleCloseAutoFocus } = useDrawerTableFocus({
    isOpen: open,
    isContentReady: !isLoading && !!invoice,
    drawerTableRef: headerTableRef,
    mainTableRef,
  })

  // Transform invoice data for tables
  const headerData = useMemo((): HeaderRow[] => {
    if (!invoice) return []
    return [
      {
        id: 'header',
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate ? invoice.invoiceDate.split('T')[0] : null,
        dueDate: invoice.dueDate ? invoice.dueDate.split('T')[0] : null,
        serviceDate: invoice.serviceDate ? invoice.serviceDate.split('T')[0] : null,
        currencyCode: invoice.currencyCode,
      },
    ]
  }, [invoice])

  const referencesData = useMemo((): ReferencesRow[] => {
    if (!invoice) return []
    const meta = invoice.transportationMetadata || {}
    return [
      {
        id: 'references',
        blNumber: invoice.blNumber || meta.blNumber || null,
        bookingNumber: meta.bookingNumber || null,
        contractor: meta.carrierName || null,
        customReference: invoice.customReference || null,
      },
    ]
  }, [invoice])

  const containersData = useMemo((): ContainerRow[] => {
    if (!invoice) return []
    const containers = invoice.containerNumbers || []
    return containers.map((cn, idx) => ({
      id: `container-${idx}`,
      containerNumber: cn,
    }))
  }, [invoice])

  const partiesData = useMemo((): PartyRow[] => {
    if (!invoice) return []
    return [
      {
        id: 'seller',
        type: 'Seller',
        name: invoice.sellerName,
        taxId: invoice.sellerTaxId,
        address: invoice.sellerAddress,
      },
      {
        id: 'buyer',
        type: 'Buyer',
        name: invoice.buyerName,
        taxId: invoice.buyerTaxId,
        address: invoice.buyerAddress,
      },
    ]
  }, [invoice])

  const totalsData = useMemo((): TotalRow[] => {
    if (!invoice) return []
    return [
      {
        id: 'totals',
        netAmount: invoice.netAmount,
        vatAmount: invoice.vatAmount,
        grossAmount: invoice.grossAmount,
      },
    ]
  }, [invoice])

  const lineItemsData = useMemo(() => {
    if (!invoice) return []
    return (invoice.lineItems ?? []).map((li) => ({
      ...li,
      chargeCode: li.chargeCode || (li.productId ? 'Matched' : null),
    }))
  }, [invoice])

  // Mutations
  const approveMutation = useMutation({
    mutationFn: async () => {
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'approve' }),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      onInvoiceUpdated?.()
    },
  })

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}/match-charges`, {
        method: 'POST',
        body: JSON.stringify({ matches: [], applyBestMatches: true, minConfidence: 50 }),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
  })

  const updateInvoiceMutation = useMutation({
    mutationFn: async (data: Partial<Invoice>) => {
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
  })

  const updateLineItemMutation = useMutation({
    mutationFn: async (item: Partial<LineItem> & { id: string }) => {
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}/line-items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(item),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
  })

  const createLineItemMutation = useMutation({
    mutationFn: async (item: Partial<LineItem>) => {
      const { result } = await apiCall(`/api/fms_financials/invoices/${invoiceId}/line-items`, {
        method: 'POST',
        body: JSON.stringify(item),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
  })

  // Event handlers for table cell changes
  const handleHeaderCellChange = useCallback((payload: CellEditSaveEvent) => {
    if (!invoice) return
    const { prop, newValue } = payload

    const updateData: Partial<Invoice> = {}
    if (prop === 'invoiceNumber') updateData.invoiceNumber = newValue as string
    if (prop === 'invoiceDate') updateData.invoiceDate = newValue as string
    if (prop === 'dueDate') updateData.dueDate = newValue as string
    if (prop === 'serviceDate') updateData.serviceDate = newValue as string
    if (prop === 'currencyCode') updateData.currencyCode = newValue as string

    if (Object.keys(updateData).length > 0) {
      updateInvoiceMutation.mutate(updateData)
    }
  }, [invoice, updateInvoiceMutation])

  const handleReferencesCellChange = useCallback((payload: CellEditSaveEvent) => {
    if (!invoice) return
    const { prop, newValue } = payload

    // Direct fields on invoice
    if (prop === 'blNumber') {
      updateInvoiceMutation.mutate({ blNumber: newValue as string })
    } else if (prop === 'customReference') {
      updateInvoiceMutation.mutate({ customReference: newValue as string })
    } else if (prop === 'bookingNumber' || prop === 'contractor') {
      const currentMeta = invoice.transportationMetadata || {}
      const metaField = prop === 'contractor' ? 'carrierName' : prop
      updateInvoiceMutation.mutate({
        transportationMetadata: {
          ...currentMeta,
          [metaField]: newValue as string,
        },
      })
    }
  }, [invoice, updateInvoiceMutation])

  const handleContainerCellChange = useCallback((payload: CellEditSaveEvent) => {
    if (!invoice) return
    const { rowIndex, newValue } = payload

    // Update the container at the given index
    const currentContainers = [...(invoice.containerNumbers || [])]
    const newContainerNumber = (newValue as string || '').trim()

    if (rowIndex >= 0 && rowIndex < currentContainers.length) {
      if (newContainerNumber) {
        currentContainers[rowIndex] = newContainerNumber
      } else {
        // Remove empty containers
        currentContainers.splice(rowIndex, 1)
      }
      updateInvoiceMutation.mutate({ containerNumbers: currentContainers })
    }
  }, [invoice, updateInvoiceMutation])

  const handleNewContainerSave = useCallback((payload: NewRowSaveEvent) => {
    if (!invoice) return
    const { rowData } = payload
    const newContainerNumber = ((rowData.containerNumber as string) || '').trim()

    if (newContainerNumber) {
      const currentContainers = [...(invoice.containerNumbers || [])]
      currentContainers.push(newContainerNumber)
      updateInvoiceMutation.mutate({ containerNumbers: currentContainers })
    }
  }, [invoice, updateInvoiceMutation])

  const handlePartyCellChange = useCallback((payload: CellEditSaveEvent) => {
    if (!invoice) return
    const { prop, newValue, rowIndex } = payload
    const partyType = partiesData[rowIndex]?.type as 'Seller' | 'Buyer'

    const updateData: Partial<Invoice> = {}
    if (partyType === 'Seller') {
      if (prop === 'name') updateData.sellerName = newValue as string
      if (prop === 'taxId') updateData.sellerTaxId = newValue as string
      if (prop === 'address') updateData.sellerAddress = newValue as string
    } else {
      if (prop === 'name') updateData.buyerName = newValue as string
      if (prop === 'taxId') updateData.buyerTaxId = newValue as string
      if (prop === 'address') updateData.buyerAddress = newValue as string
    }

    if (Object.keys(updateData).length > 0) {
      updateInvoiceMutation.mutate(updateData)
    }
  }, [invoice, updateInvoiceMutation, partiesData])

  const handleTotalCellChange = useCallback((payload: CellEditSaveEvent) => {
    if (!invoice) return
    const { prop, newValue } = payload

    // Convert numeric values to string format for API
    const stringValue = newValue != null ? String(newValue) : '0'

    const updateData: Partial<Invoice> = {}
    if (prop === 'netAmount') updateData.netAmount = stringValue
    if (prop === 'vatAmount') updateData.vatAmount = stringValue
    if (prop === 'grossAmount') updateData.grossAmount = stringValue

    if (Object.keys(updateData).length > 0) {
      updateInvoiceMutation.mutate(updateData)
    }
  }, [invoice, updateInvoiceMutation])

  const handleLineItemCellChange = useCallback((payload: CellEditSaveEvent) => {
    const { id, prop, newValue } = payload
    // Skip if no id
    if (!id) return

    // Convert numeric fields to string format for API
    const numericFields = ['quantity', 'unitPriceNet', 'vatRate', 'netAmount', 'vatAmount', 'grossAmount', 'lineNumber']
    const value = numericFields.includes(prop) && newValue != null ? String(newValue) : newValue

    updateLineItemMutation.mutate({
      id: id as string,
      [prop]: value,
    })
  }, [updateLineItemMutation])

  const handleNewLineItemSave = useCallback((payload: NewRowSaveEvent) => {
    const { rowData } = payload
    createLineItemMutation.mutate({
      description: (rowData.description as string) || 'New item',
      quantity: (rowData.quantity as string) || '1',
      unit: rowData.unit as string | null,
      unitPriceNet: (rowData.unitPriceNet as string) || '0',
      vatRate: (rowData.vatRate as string) || '0',
      netAmount: (rowData.netAmount as string) || '0',
      vatAmount: (rowData.vatAmount as string) || '0',
      grossAmount: (rowData.grossAmount as string) || '0',
    })
  }, [createLineItemMutation])

  // Register event handlers
  useEventHandlers(
    { [TableEvents.CELL_EDIT_SAVE]: handleHeaderCellChange },
    headerTableRef as React.RefObject<HTMLElement>
  )

  useEventHandlers(
    { [TableEvents.CELL_EDIT_SAVE]: handleReferencesCellChange },
    referencesTableRef as React.RefObject<HTMLElement>
  )

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: handleContainerCellChange,
      [TableEvents.NEW_ROW_SAVE]: handleNewContainerSave,
    },
    containersTableRef as React.RefObject<HTMLElement>
  )

  useEventHandlers(
    { [TableEvents.CELL_EDIT_SAVE]: handlePartyCellChange },
    partiesTableRef as React.RefObject<HTMLElement>
  )

  useEventHandlers(
    { [TableEvents.CELL_EDIT_SAVE]: handleTotalCellChange },
    totalsTableRef as React.RefObject<HTMLElement>
  )

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: handleLineItemCellChange,
      [TableEvents.NEW_ROW_SAVE]: handleNewLineItemSave,
    },
    lineItemsTableRef as React.RefObject<HTMLElement>
  )

  const handleApprove = useCallback(() => {
    approveMutation.mutate()
  }, [approveMutation])

  const handleAutoMatch = useCallback(() => {
    autoMatchMutation.mutate()
  }, [autoMatchMutation])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending Review</Badge>
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>
      case 'matched':
        return <Badge variant="default">Matched</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getConfidenceBadge = (confidence: string | null) => {
    switch (confidence) {
      case 'HIGH':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">High</Badge>
      case 'MEDIUM':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">Medium</Badge>
      case 'LOW':
        return <Badge variant="destructive" className="text-xs">Low</Badge>
      default:
        return null
    }
  }

  const unmatchedCount = invoice?.lineItems?.filter((li) => !li.productId).length ?? 0

  const headerColumns = useMemo(() => getHeaderColumns(), [])
  const referencesColumns = useMemo(() => getReferencesColumns(), [])
  const containersColumns = useMemo(() => getContainersColumns(), [])
  const partiesColumns = useMemo(() => getPartiesColumns(), [])
  const totalsColumns = useMemo(() => getTotalsColumns(invoice?.currencyCode ?? 'PLN'), [invoice?.currencyCode])
  const lineItemsColumns = useMemo(() => getLineItemsColumns(invoice?.currencyCode ?? 'PLN'), [invoice?.currencyCode])

  // Dynamic sibling refs: skip Line Items table when it has no rows
  // (DynamicTable's handleFocus bails out on empty tables, breaking the chain)
  const hasLineItems = lineItemsData.length > 0
  const totalsSiblingRefs = useMemo(() => ({
    prev: partiesTableRef,
    next: hasLineItems ? lineItemsTableRef : referencesTableRef,
  }), [hasLineItems])
  const referencesSiblingRefs = useMemo(() => ({
    prev: hasLineItems ? lineItemsTableRef : totalsTableRef,
  }), [hasLineItems])

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          fullWidth
          className="p-0"
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <Spinner className="h-8 w-8" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full text-destructive">
              Failed to load invoice
            </div>
          )}

          {invoice && (
            <div className="flex h-full w-full">
              {/* Left Panel - Page Preview */}
              {hasPages && invoiceId && (
                <div className="flex-shrink-0 border-r flex flex-col h-full bg-muted/30" style={{ width: '50%' }}>
                  <PagePreview
                    invoiceId={invoiceId}
                    pageNumber={selectedPage}
                    totalPages={totalPages}
                    className="flex-1"
                  />
                  <PageThumbnails
                    invoiceId={invoiceId}
                    totalPages={totalPages}
                    selectedPage={selectedPage}
                    onSelectPage={setSelectedPage}
                  />
                </div>
              )}

              {/* Right Panel - Invoice Details */}
              <div className="flex-1 flex flex-col h-full min-w-0">
                {/* Header */}
                <div className="flex-shrink-0 border-b bg-background px-6 py-4">
                  <div className="flex items-center gap-4">
                    {invoice.status === 'pending_review' && (
                      <Button
                        size="sm"
                        onClick={handleApprove}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                    )}
                    {getStatusBadge(invoice.status)}
                    {invoice.extractionConfidence && getConfidenceBadge(invoice.extractionConfidence)}
                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 space-y-6">
                    {/* Invoice Header Info */}
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Invoice Details</Label>
                      <DynamicTable
                        tableRef={headerTableRef}
                        data={headerData}
                        columns={headerColumns}
                        tableName="Invoice Details"
                        idColumnName="id"
                        colHeaders={true}
                        rowHeaders={false}
                        stretchColumns={true}
                        autoSelectOnFocus={true}
                        siblingTableRefs={{ next: partiesTableRef }}
                        uiConfig={{
                          hideAddRowButton: true,
                          hideToolbar: true,
                          hideBottomBar: true,
                          hideActionsColumn: true,
                        }}
                      />
                    </div>

                    {/* Parties Table */}
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Parties</Label>
                      <DynamicTable
                        tableRef={partiesTableRef}
                        data={partiesData}
                        columns={partiesColumns}
                        tableName="Parties"
                        idColumnName="id"
                        colHeaders={true}
                        rowHeaders={false}
                        stretchColumns={true}
                        autoSelectOnFocus={true}
                        siblingTableRefs={{ prev: headerTableRef, next: totalsTableRef }}
                        uiConfig={{
                          hideAddRowButton: true,
                          hideToolbar: true,
                          hideBottomBar: true,
                          hideActionsColumn: true,
                        }}
                      />
                    </div>

                    {/* Totals Table */}
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Totals</Label>
                      <DynamicTable
                        tableRef={totalsTableRef}
                        data={totalsData}
                        columns={totalsColumns}
                        tableName="Totals"
                        idColumnName="id"
                        colHeaders={true}
                        rowHeaders={false}
                        stretchColumns={true}
                        autoSelectOnFocus={true}
                        siblingTableRefs={totalsSiblingRefs}
                        uiConfig={{
                          hideAddRowButton: true,
                          hideToolbar: true,
                          hideBottomBar: true,
                          hideActionsColumn: true,
                        }}
                      />
                    </div>

                    {/* Line Items */}
                    <div>
                      <DynamicTable
                        tableRef={lineItemsTableRef}
                        data={lineItemsData}
                        columns={lineItemsColumns}
                        tableName={`Line Items (${invoice.lineItems?.length ?? 0})`}
                        idColumnName="id"
                        colHeaders={true}
                        rowHeaders={false}
                        stretchColumns={true}
                        autoSelectOnFocus={true}
                        siblingTableRefs={{ prev: totalsTableRef, next: referencesTableRef }}
                        uiConfig={{
                          hideAddRowButton: false,
                          hideToolbar: false,
                          hideBottomBar: true,
                          hideActionsColumn: true,
                          hideSearch: true,
                          hideFilterButton: true,
                          hideColumnsButton: true,
                          hideSortButton: true,
                          enableFullscreen: true,
                          topBarEnd: unmatchedCount > 0 ? (
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                {unmatchedCount} unmatched
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAutoMatch}
                                disabled={autoMatchMutation.isPending}
                              >
                                <Wand2 className="mr-2 h-4 w-4" />
                                Auto-Match
                              </Button>
                            </div>
                          ) : undefined,
                        }}
                      />
                    </div>

                    {/* References */}
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">References</Label>
                      <DynamicTable
                        tableRef={referencesTableRef}
                        data={referencesData}
                        columns={referencesColumns}
                        tableName="References"
                        idColumnName="id"
                        colHeaders={true}
                        rowHeaders={false}
                        stretchColumns={true}
                        autoSelectOnFocus={true}
                        siblingTableRefs={{ ...referencesSiblingRefs, next: containersTableRef }}
                        uiConfig={{
                          hideAddRowButton: true,
                          hideToolbar: true,
                          hideBottomBar: true,
                          hideActionsColumn: true,
                        }}
                      />
                    </div>

                    {/* Containers */}
                    <div>
                      <DynamicTable
                        tableRef={containersTableRef}
                        data={containersData}
                        columns={containersColumns}
                        tableName={`Containers (${containersData.length})`}
                        idColumnName="id"
                        colHeaders={true}
                        rowHeaders={false}
                        stretchColumns={true}
                        autoSelectOnFocus={true}
                        siblingTableRefs={{ prev: referencesTableRef }}
                        uiConfig={{
                          hideAddRowButton: false,
                          hideToolbar: false,
                          hideBottomBar: true,
                          hideActionsColumn: false,
                          hideSearch: true,
                          hideFilterButton: true,
                          hideColumnsButton: true,
                          hideSortButton: true,
                        }}
                        actionsRenderer={(rowData, rowIndex) => (
                          <button
                            onClick={() => {
                              if (!invoice) return
                              const currentContainers = [...(invoice.containerNumbers || [])]
                              currentContainers.splice(rowIndex, 1)
                              updateInvoiceMutation.mutate({ containerNumbers: currentContainers })
                            }}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Remove container"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      />
                    </div>

                    {/* Review Notes (if rejected) */}
                    {invoice.status === 'rejected' && invoice.reviewNotes && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <Label className="text-red-800 text-sm font-medium">Rejection Reason</Label>
                        <p className="text-sm text-red-700 mt-2">{invoice.reviewNotes}</p>
                      </div>
                    )}

                    {/* File Info */}
                    {invoice.originalFilename && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4 border-t">
                        <FileText className="h-4 w-4" />
                        <span>{invoice.originalFilename}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Line Item Matcher */}
      {matchingLineItemId && invoice && (
        <LineItemMatcher
          open={!!matchingLineItemId}
          onOpenChange={(open) => !open && setMatchingLineItemId(null)}
          lineItem={(invoice.lineItems ?? []).find((li) => li.id === matchingLineItemId)!}
          invoiceId={invoice.id}
          onMatchSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
            setMatchingLineItemId(null)
          }}
        />
      )}
    </>
  )
}
