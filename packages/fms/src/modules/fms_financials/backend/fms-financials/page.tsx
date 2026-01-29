/**
 * FMS Financials Module - Invoice Dashboard
 * Invoice processing with AI-powered OCR extraction and charge code matching
 * Multiple perspectives: All Invoices, Pending Review, By Supplier, By Month, Unmatched
 */

'use client'

import * as React from 'react'
import { useMemo, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  TableEvents,
  useEventHandlers,
  useFilterSuggestions,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  PerspectiveConfig,
  PerspectiveSelectEvent,
  CellEditSaveEvent,
  KeyboardShortcutsConfig,
} from '@open-mercato/ui/backend/dynamic-table'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Upload, Eye } from 'lucide-react'
import { InvoiceUploadDialog } from '../../components/InvoiceUploadDialog'
import { InvoiceDetailPanel } from '../../components/InvoiceDetailPanel'

// ============================================
// TYPE DEFINITIONS
// ============================================

interface InvoiceRow {
  id: string
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  sellerName: string | null
  buyerName: string | null
  netAmount: string
  vatAmount: string
  grossAmount: string
  currencyCode: string
  status: string
  extractionConfidence: string | null
  originalFilename: string | null
  createdAt: string
}

interface AggregatedRow {
  id: string
  groupKey: string
  invoiceCount: number
  totalNetAmount: number
  totalVatAmount: number
  totalGrossAmount: number
  pendingCount: number
  approvedCount: number
}

// ============================================
// AGGREGATION FUNCTIONS
// ============================================

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const groupKey = keyFn(item)
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(item)
      return groups
    },
    {} as Record<string, T[]>
  )
}

function aggregateBySupplier(data: InvoiceRow[]): AggregatedRow[] {
  const grouped = groupBy(data, (item) => item.sellerName || 'Unknown')
  return Object.entries(grouped).map(([supplier, invoices]) => ({
    id: `supplier-${supplier}`,
    groupKey: supplier,
    invoiceCount: invoices.length,
    totalNetAmount: invoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount || '0'), 0),
    totalVatAmount: invoices.reduce((sum, inv) => sum + parseFloat(inv.vatAmount || '0'), 0),
    totalGrossAmount: invoices.reduce((sum, inv) => sum + parseFloat(inv.grossAmount || '0'), 0),
    pendingCount: invoices.filter((inv) => inv.status === 'pending_review').length,
    approvedCount: invoices.filter((inv) => inv.status === 'approved' || inv.status === 'matched').length,
  }))
}

function aggregateByMonth(data: InvoiceRow[]): AggregatedRow[] {
  const grouped = groupBy(data, (item) => {
    if (!item.invoiceDate) return 'No Date'
    const date = new Date(item.invoiceDate)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, invoices]) => ({
      id: `month-${month}`,
      groupKey: month === 'No Date' ? month : formatMonth(month),
      invoiceCount: invoices.length,
      totalNetAmount: invoices.reduce((sum, inv) => sum + parseFloat(inv.netAmount || '0'), 0),
      totalVatAmount: invoices.reduce((sum, inv) => sum + parseFloat(inv.vatAmount || '0'), 0),
      totalGrossAmount: invoices.reduce((sum, inv) => sum + parseFloat(inv.grossAmount || '0'), 0),
      pendingCount: invoices.filter((inv) => inv.status === 'pending_review').length,
      approvedCount: invoices.filter((inv) => inv.status === 'approved' || inv.status === 'matched').length,
    }))
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

// ============================================
// DROPDOWN OPTIONS
// ============================================

const STATUS_OPTIONS = [
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'matched', label: 'Matched' },
]

const CONFIDENCE_OPTIONS = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
]

// ============================================
// PERSPECTIVES CONFIGURATION
// ============================================

const PERSPECTIVES: PerspectiveConfig[] = [
  {
    id: 'all',
    name: 'All Invoices',
    color: 'blue',
    columns: {
      visible: [
        'invoiceNumber',
        'invoiceDate',
        'sellerName',
        'grossAmount',
        'status',
        'extractionConfidence',
      ],
      hidden: ['dueDate', 'buyerName', 'netAmount', 'vatAmount', 'currencyCode', 'originalFilename', 'createdAt'],
    },
    filters: [],
    sorting: [{ id: 'createdAt', field: 'createdAt', direction: 'desc' }],
  },
  {
    id: 'pending',
    name: 'Pending Review',
    color: 'yellow',
    columns: {
      visible: [
        'invoiceNumber',
        'invoiceDate',
        'sellerName',
        'grossAmount',
        'extractionConfidence',
      ],
      hidden: ['dueDate', 'buyerName', 'netAmount', 'vatAmount', 'currencyCode', 'status', 'originalFilename', 'createdAt'],
    },
    filters: [],
    sorting: [{ id: 'createdAt', field: 'createdAt', direction: 'desc' }],
  },
  {
    id: 'by-supplier',
    name: 'By Supplier',
    color: 'purple',
    columns: {
      visible: ['groupKey', 'invoiceCount', 'totalGrossAmount', 'pendingCount', 'approvedCount'],
      hidden: ['totalNetAmount', 'totalVatAmount'],
    },
    filters: [],
    sorting: [{ id: 'totalGrossAmount', field: 'totalGrossAmount', direction: 'desc' }],
  },
  {
    id: 'by-month',
    name: 'By Month',
    color: 'green',
    columns: {
      visible: ['groupKey', 'invoiceCount', 'totalGrossAmount', 'pendingCount', 'approvedCount'],
      hidden: ['totalNetAmount', 'totalVatAmount'],
    },
    filters: [],
    sorting: [{ id: 'groupKey', field: 'groupKey', direction: 'desc' }],
  },
]

// ============================================
// RENDERERS
// ============================================

const StatusRenderer = ({ value }: { value: string }) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    pending_review: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800' },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
    matched: { label: 'Matched', color: 'bg-blue-100 text-blue-800' },
  }

  const status = statusMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
      {status.label}
    </span>
  )
}

const ConfidenceRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground">-</span>

  const confidenceMap: Record<string, { label: string; color: string }> = {
    HIGH: { label: 'High', color: 'bg-green-100 text-green-800' },
    MEDIUM: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    LOW: { label: 'Low', color: 'bg-red-100 text-red-800' },
  }

  const conf = confidenceMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${conf.color}`}>
      {conf.label}
    </span>
  )
}

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

const formatDate = (value: string | null) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pl-PL')
}

const CurrencyRenderer = (value: string | number) => formatCurrency(value)
const DateRenderer = (value: string | null) => formatDate(value)

const DETAIL_RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  ConfidenceRenderer: (value) => <ConfidenceRenderer value={value} />,
  CurrencyRenderer: (value, rowData) => formatCurrency(value, rowData?.currencyCode),
  DateRenderer: (value) => DateRenderer(value),
}

const AGGREGATED_RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  CurrencyRenderer: (value) => CurrencyRenderer(value),
}

// ============================================
// COLUMN DEFINITIONS
// ============================================

function getDetailColumns(): ColumnDef[] {
  return [
    {
      data: 'invoiceNumber',
      title: 'Invoice #',
      width: 140,
      readOnly: false,
    },
    {
      data: 'invoiceDate',
      title: 'Date',
      width: 100,
      type: 'date',
      readOnly: false,
      renderer: DETAIL_RENDERERS.DateRenderer,
    },
    {
      data: 'dueDate',
      title: 'Due Date',
      width: 100,
      type: 'date',
      readOnly: false,
      renderer: DETAIL_RENDERERS.DateRenderer,
    },
    {
      data: 'sellerName',
      title: 'Supplier',
      width: 180,
      readOnly: false,
    },
    {
      data: 'buyerName',
      title: 'Buyer',
      width: 150,
      readOnly: false,
    },
    {
      data: 'netAmount',
      title: 'Net',
      width: 110,
      type: 'numeric',
      readOnly: false,
      renderer: DETAIL_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'vatAmount',
      title: 'VAT',
      width: 90,
      type: 'numeric',
      readOnly: false,
      renderer: DETAIL_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'grossAmount',
      title: 'Gross',
      width: 110,
      type: 'numeric',
      readOnly: false,
      renderer: DETAIL_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'currencyCode',
      title: 'Currency',
      width: 70,
      readOnly: false,
    },
    {
      data: 'status',
      title: 'Status',
      width: 120,
      readOnly: false,
      type: 'dropdown',
      source: STATUS_OPTIONS,
      renderer: DETAIL_RENDERERS.StatusRenderer,
    },
    {
      data: 'extractionConfidence',
      title: 'OCR',
      width: 80,
      readOnly: false,
      type: 'dropdown',
      source: CONFIDENCE_OPTIONS,
      renderer: DETAIL_RENDERERS.ConfidenceRenderer,
    },
    {
      data: 'originalFilename',
      title: 'File',
      width: 150,
      readOnly: true,
    },
    {
      data: 'createdAt',
      title: 'Uploaded',
      width: 100,
      type: 'date',
      readOnly: true,
      renderer: DETAIL_RENDERERS.DateRenderer,
    },
  ] as ColumnDef[]
}

function getAggregatedColumns(perspectiveId: string): ColumnDef[] {
  const titleMap: Record<string, string> = {
    'by-supplier': 'Supplier',
    'by-month': 'Month',
  }

  return [
    {
      data: 'groupKey',
      title: titleMap[perspectiveId] || 'Group',
      width: 200,
      readOnly: true,
    },
    {
      data: 'invoiceCount',
      title: 'Invoices',
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'totalNetAmount',
      title: 'Net Total',
      width: 120,
      type: 'numeric',
      readOnly: true,
      renderer: AGGREGATED_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'totalVatAmount',
      title: 'VAT Total',
      width: 100,
      type: 'numeric',
      readOnly: true,
      renderer: AGGREGATED_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'totalGrossAmount',
      title: 'Gross Total',
      width: 130,
      type: 'numeric',
      readOnly: true,
      renderer: AGGREGATED_RENDERERS.CurrencyRenderer,
    },
    {
      data: 'pendingCount',
      title: 'Pending',
      width: 80,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'approvedCount',
      title: 'Approved',
      width: 80,
      type: 'numeric',
      readOnly: true,
    },
  ] as ColumnDef[]
}


// ============================================
// MAIN COMPONENT
// ============================================

export default function FinancialsDashboardPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [activePerspectiveId, setActivePerspectiveId] = useState<string>('all')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)

  // Server-side filter suggestions for large datasets
  const loadFilterSuggestions = useFilterSuggestions({
    entityType: 'fms_financials:fms_invoice',
  })

  // Fetch invoices from API
  const { data: invoicesData, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { result } = await apiCall('/api/fms_financials/invoices?limit=100')
      return result as { items: InvoiceRow[]; total: number }
    },
  })

  const invoices = invoicesData?.items ?? []

  // Mutation for updating invoice inline
  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const { result } = await apiCall(`/api/fms_financials/invoices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })

  // Filter invoices for pending perspective
  const filteredInvoices = useMemo(() => {
    if (activePerspectiveId === 'pending') {
      return invoices.filter((inv) => inv.status === 'pending_review')
    }
    return invoices
  }, [invoices, activePerspectiveId])

  // Get data based on active perspective
  const tableData = useMemo(() => {
    switch (activePerspectiveId) {
      case 'by-supplier':
        return aggregateBySupplier(invoices)
      case 'by-month':
        return aggregateByMonth(invoices)
      case 'pending':
        return filteredInvoices
      case 'all':
      default:
        return invoices
    }
  }, [activePerspectiveId, invoices, filteredInvoices])

  // Get columns based on active perspective
  const columns = useMemo(() => {
    if (activePerspectiveId === 'all' || activePerspectiveId === 'pending') {
      return getDetailColumns()
    }
    return getAggregatedColumns(activePerspectiveId)
  }, [activePerspectiveId])

  // Handle perspective change
  const handlePerspectiveSelect = useCallback((payload: PerspectiveSelectEvent) => {
    if (payload.id) {
      setActivePerspectiveId(payload.id)
    } else {
      setActivePerspectiveId('all')
    }
  }, [])

  // Handle view invoice
  const handleViewInvoice = useCallback((invoiceId: string) => {
    setSelectedInvoiceId(invoiceId)
    setDetailPanelOpen(true)
  }, [])

  // Handle upload success
  const handleUploadSuccess = useCallback((invoiceId: string) => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    setSelectedInvoiceId(invoiceId)
    setDetailPanelOpen(true)
  }, [queryClient])

  // Handle invoice updated
  const handleInvoiceUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }, [queryClient])

  // Handle inline cell editing
  const handleCellEditSave = useCallback((payload: CellEditSaveEvent) => {
    // Only handle edits for detail perspectives (all, pending)
    if (activePerspectiveId !== 'all' && activePerspectiveId !== 'pending') {
      return
    }

    const { prop, newValue, id } = payload

    if (!id) {
      return
    }

    // Build update payload based on field
    const updateData: Record<string, unknown> = {}

    // Text fields
    if (prop === 'invoiceNumber' || prop === 'sellerName' || prop === 'buyerName' || prop === 'currencyCode') {
      updateData[prop] = newValue as string
    }
    // Date fields
    else if (prop === 'invoiceDate' || prop === 'dueDate') {
      if (newValue) {
        updateData[prop] = newValue instanceof Date ? newValue.toISOString() : newValue
      } else {
        updateData[prop] = null
      }
    }
    // Numeric fields
    else if (prop === 'netAmount' || prop === 'vatAmount' || prop === 'grossAmount') {
      const numVal = typeof newValue === 'number' ? newValue : parseFloat(String(newValue))
      if (!isNaN(numVal)) {
        updateData[prop] = numVal.toFixed(2)
      }
    }
    // Dropdown fields - extract value if it's an object
    else if (prop === 'status' || prop === 'extractionConfidence') {
      const val = typeof newValue === 'object' && newValue !== null
        ? (newValue as { value: string }).value
        : newValue
      updateData[prop] = val as string
    }

    if (Object.keys(updateData).length > 0) {
      updateInvoiceMutation.mutate({ id: id as string, data: updateData })
    }
  }, [activePerspectiveId, updateInvoiceMutation])

  // Keyboard shortcuts - only for detail perspectives (all, pending)
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig | undefined => {
    if (activePerspectiveId !== 'all' && activePerspectiveId !== 'pending') {
      return undefined
    }
    return {
      rowActions: [
        { id: 'view', label: 'Open invoice details', key: 'Enter', shift: true },
      ],
    }
  }, [activePerspectiveId])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    if (actionId === 'view' && rowData.id) {
      handleViewInvoice(rowData.id)
    }
  }, [handleViewInvoice])

  useEventHandlers(
    {
      [TableEvents.PERSPECTIVE_SELECT]: handlePerspectiveSelect,
      [TableEvents.CELL_EDIT_SAVE]: handleCellEditSave,
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Actions renderer for detail rows
  const actionsRenderer = useCallback((rowData: any) => {
    if (activePerspectiveId !== 'all' && activePerspectiveId !== 'pending') {
      return null
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleViewInvoice(rowData.id)}
      >
        <Eye className="h-4 w-4" />
      </Button>
    )
  }, [activePerspectiveId, handleViewInvoice])

  if (error) {
    return (
      <Page>
        <PageBody>
          <div className="flex items-center justify-center h-[400px] text-destructive">
            Failed to load invoices
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px]">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <DynamicTable
            tableRef={tableRef}
            data={tableData}
            columns={columns}
            tableName="FMS Invoices"
            idColumnName="id"
            height="calc(100vh - 110px)"
            colHeaders={true}
            rowHeaders={true}
            stretchColumns={true}
            savedPerspectives={PERSPECTIVES}
            activePerspectiveId={activePerspectiveId}
            actionsRenderer={actionsRenderer}
            keyboardShortcuts={keyboardShortcuts}
            onRowAction={handleRowAction}
            loadFilterSuggestions={loadFilterSuggestions}
            uiConfig={{
              hideAddRowButton: true,
              topBarEnd: (
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Invoice
                </Button>
              ),
            }}
          />
        )}

        <InvoiceUploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          onUploadSuccess={handleUploadSuccess}
        />

        <InvoiceDetailPanel
          invoiceId={selectedInvoiceId}
          open={detailPanelOpen}
          onOpenChange={setDetailPanelOpen}
          onInvoiceUpdated={handleInvoiceUpdated}
          mainTableRef={tableRef}
        />
      </PageBody>
    </Page>
  )
}
