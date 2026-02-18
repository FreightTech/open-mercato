"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableEvents,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Trash2 } from 'lucide-react'
import { ShipmentDrawer } from '../../components/ShipmentDrawer'
import { CombinedTimestampCell, type TimestampEntry } from '../../components/CombinedTimestampCell'

type ShipmentRow = {
  id: string
  status: string
  carrierCode: string | null
  containerNumber: string | null
  bookingNumber: string | null
  bolNumber: string | null
  // Multi-source timestamp arrays
  etdTimestamps: TimestampEntry[] | null
  etaTimestamps: TimestampEntry[] | null
  atdTimestamps: TimestampEntry[] | null
  ataTimestamps: TimestampEntry[] | null
  originName: string | null
  destinationName: string | null
  vesselName: string | null
  eventCount: number
  createdAt: string | null
}

type ListResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
}

function mapItem(item: Record<string, unknown>): ShipmentRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null

  return {
    id,
    status: (item.status as string) ?? 'ORDERED',
    carrierCode: (item.carrierCode as string) ?? (item.carrier_code as string) ?? null,
    containerNumber: (item.containerNumber as string) ?? (item.container_number as string) ?? null,
    bookingNumber: (item.bookingNumber as string) ?? (item.booking_number as string) ?? null,
    bolNumber: (item.bolNumber as string) ?? (item.bol_number as string) ?? null,
    // Multi-source timestamp arrays
    etdTimestamps: (item.etdTimestamps as TimestampEntry[]) ?? (item.etd_timestamps as TimestampEntry[]) ?? null,
    etaTimestamps: (item.etaTimestamps as TimestampEntry[]) ?? (item.eta_timestamps as TimestampEntry[]) ?? null,
    atdTimestamps: (item.atdTimestamps as TimestampEntry[]) ?? (item.atd_timestamps as TimestampEntry[]) ?? null,
    ataTimestamps: (item.ataTimestamps as TimestampEntry[]) ?? (item.ata_timestamps as TimestampEntry[]) ?? null,
    originName: (item.originName as string) ?? (item.origin_name as string) ?? null,
    destinationName: (item.destinationName as string) ?? (item.destination_name as string) ?? null,
    vesselName: (item.vesselName as string) ?? (item.vessel_name as string) ?? null,
    eventCount: typeof item.eventCount === 'number' ? item.eventCount : (typeof item.event_count === 'number' ? item.event_count : 0),
    createdAt: (item.createdAt as string) ?? (item.created_at as string) ?? null,
  }
}

const STATUS_COLORS: Record<string, string> = {
  ORDERED: 'bg-gray-100 text-gray-700',
  BOOKED: 'bg-blue-100 text-blue-700',
  DEPARTED: 'bg-yellow-100 text-yellow-800',
  PRE_ARRIVAL: 'bg-orange-100 text-orange-700',
  IN_PORT: 'bg-purple-100 text-purple-700',
  DELIVERED: 'bg-green-100 text-green-700',
}

let deleteHandler: ((id: string) => void) | null = null

function setDeleteHandler(handler: ((id: string) => void) | null) {
  deleteHandler = handler
}

const DeleteButton = ({ id }: { id: string }) => {
  if (!id) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        deleteHandler?.(id)
      }}
      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete shipment"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}

export default function ShipmentListPage() {
  const t = useT()
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [rows, setRows] = React.useState<ShipmentRow[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create')
  const [selectedShipmentId, setSelectedShipmentId] = React.useState<string | undefined>(undefined)

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (search) params.set('search', search)

      const { result } = await apiCallOrThrow<ListResponse>(
        `/api/shipment_tracking/shipments?${params.toString()}`,
      )

      const items = result?.items ?? []
      setRows(items.map(mapItem).filter((x): x is ShipmentRow => x !== null))
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    } catch {
      flash(t('shipment_tracking.errors.fetchFailed', 'Failed to load shipments'), 'error')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize, search, t])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDelete = React.useCallback(
    async (id: string) => {
      if (!confirm('Are you sure you want to delete this shipment?')) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/shipments', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash('Shipment deleted', 'success')
        fetchData()
      } catch {
        flash('Failed to delete shipment', 'error')
      }
    },
    [fetchData],
  )

  React.useEffect(() => {
    setDeleteHandler(handleDelete)
    return () => setDeleteHandler(null)
  }, [handleDelete])

  const columns = React.useMemo<ColumnDef[]>(
    () => [
      {
        data: 'containerNumber',
        title: t('shipment_tracking.shipments.fields.containerNumber', 'Container'),
        width: 140,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-medium font-mono text-sm">
            {String(value || '-')}
          </span>
        ),
      },
      {
        data: 'bookingNumber',
        title: t('shipment_tracking.shipments.fields.bookingNumber', 'Booking'),
        width: 130,
        readOnly: true,
      },
      {
        data: 'status',
        title: t('shipment_tracking.shipments.fields.status', 'Status'),
        width: 110,
        readOnly: true,
        renderer: (value: unknown) => {
          const status = String(value ?? '')
          const colorClass = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
          const label = t(`shipment_tracking.shipments.statuses.${status}`, status)
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
              {label}
            </span>
          )
        },
      },
      {
        data: 'carrierCode',
        title: t('shipment_tracking.shipments.fields.carrierCode', 'Carrier'),
        width: 90,
        readOnly: true,
      },
      {
        data: 'vesselName',
        title: t('shipment_tracking.shipments.fields.vesselName', 'Vessel'),
        width: 140,
        readOnly: true,
      },
      {
        data: 'etdAtd',
        title: t('shipment_tracking.shipments.fields.etdAtd', 'ETD/ATD'),
        width: 150,
        readOnly: true,
        renderer: (_value: unknown, rowData: Record<string, unknown>) => (
          <CombinedTimestampCell
            estimatedTimestamps={rowData.etdTimestamps as TimestampEntry[] | null}
            actualTimestamps={rowData.atdTimestamps as TimestampEntry[] | null}
            label="ETD/ATD"
            format="date"
          />
        ),
      },
      {
        data: 'etaAta',
        title: t('shipment_tracking.shipments.fields.etaAta', 'ETA/ATA'),
        width: 150,
        readOnly: true,
        renderer: (_value: unknown, rowData: Record<string, unknown>) => (
          <CombinedTimestampCell
            estimatedTimestamps={rowData.etaTimestamps as TimestampEntry[] | null}
            actualTimestamps={rowData.ataTimestamps as TimestampEntry[] | null}
            label="ETA/ATA"
            format="date"
          />
        ),
      },
    ],
    [t],
  )

  const tableData = React.useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        containerNumber: row.containerNumber ?? '',
        bookingNumber: row.bookingNumber ?? '',
        status: row.status,
        carrierCode: row.carrierCode ?? '',
        vesselName: row.vesselName ?? '',
        // Timestamp arrays for combined cells
        etdTimestamps: row.etdTimestamps,
        atdTimestamps: row.atdTimestamps,
        etaTimestamps: row.etaTimestamps,
        ataTimestamps: row.ataTimestamps,
      })),
    [rows],
  )

  const actionsRenderer = React.useCallback(
    (rowData: { id: string }) => {
      if (!rowData?.id) return null
      return <DeleteButton id={rowData.id} />
    },
    [],
  )

  const handleRowClick = React.useCallback((_rowIndex: number, rowData: Record<string, unknown>) => {
    const id = rowData?.id as string | undefined
    if (id) {
      setDrawerMode('edit')
      setSelectedShipmentId(id)
      setDrawerOpen(true)
    }
  }, [])

  useEventHandlers(
    {
      [TableEvents.SEARCH]: (payload: { query: string }) => {
        setSearch(payload.query)
        setPage(1)
      },
    },
    tableRef as React.RefObject<HTMLElement>,
  )

  const tableHeight = React.useMemo(() => {
    const rowH = 40
    const headerH = 40
    const toolbarH = 50
    const minHeight = 300
    const maxHeight = 700
    const contentHeight = toolbarH + headerH + tableData.length * rowH + 20
    return Math.min(Math.max(contentHeight, minHeight), maxHeight)
  }, [tableData.length])

  return (
    <Page>
      <PageBody>
        <div style={{ height: tableHeight }}>
          <DynamicTable
            tableRef={tableRef}
            data={tableData}
            columns={columns}
            tableName={t('shipment_tracking.shipments.title', 'Shipments')}
            idColumnName="id"
            width="100%"
            height="100%"
            colHeaders={true}
            rowHeaders={false}
            stretchColumns={true}
            actionsRenderer={actionsRenderer}
            onRowClick={handleRowClick}
            pagination={{
              currentPage: page,
              totalPages,
              limit: pageSize,
              onPageChange: setPage,
              onLimitChange: (limit: number) => {
                setPageSize(limit)
                setPage(1)
              },
            }}
            uiConfig={{
              readOnlyStyle: 'normal',
              hideFilterButton: true,
              hideAddRowButton: true,
              hideBottomBar: true,
              topBarEnd: (
                <Button onClick={() => {
                  setDrawerMode('create')
                  setSelectedShipmentId(undefined)
                  setDrawerOpen(true)
                }}>
                  {t('shipment_tracking.shipments.create', 'Create Shipment')}
                </Button>
              ),
            }}
            emptyMessage="No shipments found."
          />
        </div>

        <ShipmentDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          mode={drawerMode}
          shipmentId={selectedShipmentId}
          onSaved={() => {
            fetchData()
          }}
        />
      </PageBody>
    </Page>
  )
}
