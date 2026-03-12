'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, Trash2, FileText } from 'lucide-react'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  FilterRow,
  PerspectiveConfig,
  KeyboardShortcutsConfig,
} from '@open-mercato/ui/backend/dynamic-table'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { OfferDetailDrawer } from '../../components/OfferDetailDrawer'
import type { FmsOfferStatus } from '../../data/types'

interface FmsOfferRow {
  id: string
  offerNumber: string
  version: number
  status: FmsOfferStatus
  rfqId?: string | null
  rfqTitle?: string | null
  clientId?: string | null
  clientName?: string | null
  originPortCode?: string | null
  destinationPortCode?: string | null
  validUntil?: string | null
  currencyCode?: string
  paymentTerms?: string | null
  createdAt: string
  assignedTo?: { id: string; name: string; email: string } | null
  documentId?: string | null
  operationalGuardianId?: string | null
  operationalGuardianName?: string | null
  businessGuardianId?: string | null
  businessGuardianName?: string | null
  rfq?: {
    id: string
    title?: string | null
    companyName?: string | null
    origin?: string | null
    destination?: string | null
  }
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    expired: 'bg-orange-100 text-orange-800',
    superseded: 'bg-purple-100 text-purple-600 italic',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

const StatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  return (
    <span
      className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${getStatusColor(value)}`}
    >
      {value.toUpperCase()}
    </span>
  )
}

const VersionRenderer = ({ value }: { value: number }) => {
  return <span className="text-xs text-muted-foreground">v{value}</span>
}

const DateRenderer = ({ value, format = 'short' }: { value: string; format?: 'short' | 'full' }) => {
  if (!value) return <span>-</span>
  const date = new Date(value)
  const now = new Date()
  const isExpired = date < now
  let formatted: string
  if (format === 'full') {
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    formatted = `${day}/${month}/${year}`
  } else {
    formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return (
    <span className={isExpired ? 'text-red-600' : ''}>{formatted}</span>
  )
}

// Status options for dropdown editor
const STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'declined', 'expired']

const PdfRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  return (
    <a
      href={`/api/fms_documents/documents/${value}/download`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-blue-600 hover:text-blue-800"
      title="Download PDF"
    >
      <FileText className="h-4 w-4" />
    </a>
  )
}

// Helper: Parse filter parameters from URL
function parseOffersFiltersFromUrl(searchParams: URLSearchParams | null): FilterRow[] {
  if (!searchParams) return []
  const filters: FilterRow[] = []

  // Handle status parameter (can be comma-separated)
  const status = searchParams.get('status')
  if (status) {
    const values = status.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length > 0) {
      filters.push({
        id: 'url-filter-status',
        field: 'status',
        operator: 'is_any_of',
        values: values,
      })
    }
  }

  return filters
}

// Helper: Serialize filters to URL query string
function serializeOffersFiltersToUrl(filters: FilterRow[]): string {
  const params = new URLSearchParams()

  filters.forEach(filter => {
    if (filter.field === 'status' && filter.values.length > 0) {
      params.set('status', filter.values.join(','))
    }
    // Add other filterable fields here as needed
  })

  return params.toString()
}

export default function OffersListPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [filtersInitialized, setFiltersInitialized] = useState(false)

  // URL filter perspectives (managed externally, not via the hook's perspectives API)
  const [urlPerspectives, setUrlPerspectives] = useState<PerspectiveConfig[]>([])
  const [urlActivePerspectiveId, setUrlActivePerspectiveId] = useState<string | null>(null)
  const hasInitializedOfferPerspectiveRef = useRef(false)

  const handleOfferClick = useCallback((offerId: string) => {
    setSelectedOfferId(offerId)
  }, [])

  // Entity search editor config for RFQ selection
  const rfqEditorConfig = useMemo(() => ({
    entityType: 'fms_offers:fms_rfq',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, title: r.presenter?.title || '' }),
    placeholder: 'Search RFQs...',
    minQueryLength: 2,
  }), [])

  // Entity search editor configs for guardian selection
  const operationalGuardianEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 1,
  }), [])

  const businessGuardianEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search users...',
    minQueryLength: 1,
  }), [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'offerNumber',
      title: 'Offer',
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: string, rowData: FmsOfferRow) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleOfferClick(rowData.id)
          }}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    {
      data: 'status',
      title: 'Status',
      width: 100,
      type: 'dropdown',
      readOnly: false,
      source: STATUS_OPTIONS.map((s) => ({ value: s, label: s.toUpperCase() })),
      renderer: (value) => <StatusRenderer value={value} />,
    },
    {
      data: 'version',
      title: 'Ver',
      width: 45,
      type: 'numeric',
      readOnly: false,
      renderer: (value) => <VersionRenderer value={value} />,
    },
    {
      data: 'rfqId',
      title: 'RFQ',
      width: 110,
      readOnly: false,
      editor: createEntitySearchEditor(rfqEditorConfig),
      renderer: (_value: string, rowData: FmsOfferRow) => (
        <span className="block truncate max-w-[100px]" title={rowData.rfqTitle || ''}>
          {rowData.rfqTitle || '-'}
        </span>
      ),
    },
    {
      data: 'clientName',
      title: 'Client',
      width: 140,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="truncate">{value || '-'}</span>
      ),
    },
    {
      data: 'operationalGuardianName',
      title: 'Ops Guardian',
      width: 140,
      readOnly: false,
      editor: createEntitySearchEditor(operationalGuardianEditorConfig),
      renderer: (value: string) => (
        <span className="truncate text-sm">{value || '-'}</span>
      ),
    },
    {
      data: 'businessGuardianName',
      title: 'Biz Guardian',
      width: 140,
      readOnly: false,
      editor: createEntitySearchEditor(businessGuardianEditorConfig),
      renderer: (value: string) => (
        <span className="truncate text-sm">{value || '-'}</span>
      ),
    },
    {
      data: 'documentId',
      title: 'PDF',
      width: 45,
      type: 'text',
      readOnly: true,
      renderer: (value) => <PdfRenderer value={value} />,
    },
    {
      data: 'validUntil',
      title: 'Valid Until',
      width: 100,
      type: 'date',
      readOnly: false,
      renderer: (value) => <DateRenderer value={value} format="full" />,
    },
    {
      data: 'createdAt',
      title: 'Created',
      width: 80,
      type: 'date',
      readOnly: true,
      renderer: (value) => {
        if (!value) return <span>-</span>
        const date = new Date(value)
        const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return <span>{formatted}</span>
      },
    },
  ], [handleOfferClick, rfqEditorConfig, operationalGuardianEditorConfig, businessGuardianEditorConfig])

  // Keyboard shortcuts for row actions
  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open detail', key: 'Enter', shift: true },
      { id: 'delete', label: 'Delete offer', key: 'd', ctrlOrCmd: true },
    ],
  }), [])

  // Parse URL filters once on mount to seed the hook's initial filter state
  const initialFilters = useMemo(
    () => parseOffersFiltersFromUrl(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // only on mount
  )

  const table = useDynamicTablePage<FmsOfferRow>({
    source: '/api/fms_offers/offers',
    columns,
    tableName: 'Freight Offers',
    queryKey: 'fms_offers',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    initialFilters,
    filterSuggestions: 'fms_offers:fms_offer',
    delete: {
      title: 'Delete Offer',
      nameColumn: 'offerNumber',
    },
    mapApiItem: (offer: any): FmsOfferRow => ({
      id: offer.id,
      offerNumber: offer.offerNumber,
      version: offer.version,
      status: offer.status,
      rfqId: offer.rfqId || offer.rfq?.id || null,
      rfqTitle: offer.rfq?.title || `#${offer.rfq?.id?.slice(0, 8) || '...'}`,
      clientName: offer.clientName || '-',
      validUntil: offer.validUntil,
      createdAt: offer.createdAt,
      documentId: offer.documentId || null,
      operationalGuardianId: offer.operationalGuardianId || null,
      operationalGuardianName: offer.operationalGuardianName || null,
      businessGuardianId: offer.businessGuardianId || null,
      businessGuardianName: offer.businessGuardianName || null,
    }),
    hooks: {
      beforeCellEdit: (payload, _rowData) => {
        if (payload.prop === 'rfqId') {
          try {
            const parsed = JSON.parse(String(payload.newValue || ''))
            return { payload: { rfqId: parsed.id || null } }
          } catch {
            return { payload: { rfqId: payload.newValue || null } }
          }
        }
        if (payload.prop === 'operationalGuardianName') {
          try {
            const parsed = JSON.parse(String(payload.newValue || ''))
            return { payload: { operationalGuardianId: parsed.id || null } }
          } catch {
            return { payload: { operationalGuardianId: null } }
          }
        }
        if (payload.prop === 'businessGuardianName') {
          try {
            const parsed = JSON.parse(String(payload.newValue || ''))
            return { payload: { businessGuardianId: parsed.id || null } }
          } catch {
            return { payload: { businessGuardianId: null } }
          }
        }
        if (payload.prop === 'assignedToId' && payload.newValue === '') {
          return { payload: { assignedToId: null } }
        }
      },
      beforeDelete: (row) => {
        if (row.status !== 'draft') {
          flash('Only draft offers can be deleted', 'warning')
          return false
        }
        return true
      },
    },
    tableProps: {
      height: 'calc(100vh - 110px)',
      keyboardShortcuts,
      enableComments: true,
      commentsTableId: 'fms_offers',
      uiConfig: {
        hideAddRowButton: true,
        enableFullscreen: true,
        readOnlyStyle: 'normal',
        borderless: true,
      },
    },
  })

  // Mark filters as initialized after first render
  useEffect(() => {
    setFiltersInitialized(true)
  }, [])

  // Bidirectional sync: Update URL when filters change
  useEffect(() => {
    if (!filtersInitialized) return

    const filterParams = serializeOffersFiltersToUrl(table.state.filters)
    const currentPath = '/backend/fms-offers'
    const newUrl = filterParams ? `${currentPath}?${filterParams}` : currentPath

    const currentFilterParams = serializeOffersFiltersToUrl(parseOffersFiltersFromUrl(searchParams))

    if (filterParams !== currentFilterParams) {
      router.replace(newUrl, { scroll: false })
    }
  }, [table.state.filters, router, filtersInitialized, searchParams])

  // Create URL filter perspective (memoized to prevent recreation)
  const urlFilterPerspective = useMemo(() => {
    if (columns.length === 0) return null

    const urlFilters = parseOffersFiltersFromUrl(searchParams)
    if (urlFilters.length === 0) return null

    const allCols = columns.map(c => c.data)
    return {
      id: '__url_filters__',
      name: 'Filters from URL',
      columns: { visible: allCols, hidden: [] },
      filters: urlFilters,
      sorting: [{ id: table.state.sortField, field: table.state.sortField, direction: table.state.sortDir }],
    }
  }, [columns, searchParams, table.state.sortField, table.state.sortDir])

  // Sync URL filter perspective to state
  useEffect(() => {
    if (urlFilterPerspective) {
      setUrlPerspectives([urlFilterPerspective])
      if (!hasInitializedOfferPerspectiveRef.current) {
        setUrlActivePerspectiveId('__url_filters__')
        hasInitializedOfferPerspectiveRef.current = true
      }
    } else {
      setUrlPerspectives([])
    }
  }, [urlFilterPerspective])

  // Clear URL filter perspective when filters are manually cleared
  useEffect(() => {
    if (table.state.filters.length === 0 && urlActivePerspectiveId === '__url_filters__') {
      setUrlActivePerspectiveId(null)
    }
  }, [table.state.filters, urlActivePerspectiveId])

  const handleRowAction = useCallback((actionId: string, rowData: any) => {
    const row = rowData as FmsOfferRow
    if (actionId === 'view') {
      setSelectedOfferId(row.id)
    } else if (actionId === 'delete') {
      if (row.status === 'draft') {
        table.setRowToDelete(row)
      } else {
        flash('Only draft offers can be deleted', 'warning')
      }
    }
  }, [table.setRowToDelete])

  const actionsRenderer = useCallback((rowData: unknown) => {
    const row = rowData as FmsOfferRow
    if (!row.id) return null
    const canDelete = row.status === 'draft'
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setSelectedOfferId(row.id)
          }}
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
          title="View"
        >
          <Eye className="h-4 w-4" />
        </button>
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              table.setRowToDelete(row)
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }, [table.setRowToDelete])

  if (table.isLoading) {
    return (
      <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
        <TableSkeleton rows={10} columns={9} />
      </div>
    )
  }

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <DynamicTable
        {...table.props}
        savedPerspectives={urlPerspectives}
        activePerspectiveId={urlActivePerspectiveId}
        actionsRenderer={actionsRenderer}
        onRowAction={handleRowAction}
      />
      {table.deleteDialog}

      {/* Offer detail drawer */}
      <OfferDetailDrawer
        offerId={selectedOfferId}
        open={!!selectedOfferId}
        onClose={() => setSelectedOfferId(null)}
        onDelete={() => {
          queryClient.invalidateQueries({ queryKey: ['fms_offers'] })
        }}
        mainTableRef={table.props.tableRef}
      />
    </div>
  )
}
