'use client'

import * as React from 'react'
import { useCallback, useMemo, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Trash2, Pencil, Eye } from 'lucide-react'
import { ShipmentDrawer } from '../../components/ShipmentDrawer'
import { ShipmentDetailsDrawer } from '../../components/ShipmentDetailsDrawer'
import { CombinedTimestampCell, type TimestampEntry } from '../../components/CombinedTimestampCell'

type FacilityLocation = {
  name?: string | null
  unlocode?: string | null
  countryCode?: string | null
  facilityCode?: string | null
} | null

type ShipmentRow = {
  id: string
  status: string
  carrierCode: string | null
  containerNumber: string | null
  bookingNumber: string | null
  isoEquipmentCode: string | null
  bolNumber: string | null
  etdTimestamps: TimestampEntry[] | null
  etaTimestamps: TimestampEntry[] | null
  atdTimestamps: TimestampEntry[] | null
  ataTimestamps: TimestampEntry[] | null
  originLocation: FacilityLocation
  destinationLocation: FacilityLocation
  vesselName: string | null
  eventCount: number
  createdAt: string | null
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
    isoEquipmentCode: (item.isoEquipmentCode as string) ?? (item.iso_equipment_code as string) ?? null,
    bolNumber: (item.bolNumber as string) ?? (item.bol_number as string) ?? null,
    etdTimestamps: (item.etdTimestamps as TimestampEntry[]) ?? (item.etd_timestamps as TimestampEntry[]) ?? null,
    etaTimestamps: (item.etaTimestamps as TimestampEntry[]) ?? (item.eta_timestamps as TimestampEntry[]) ?? null,
    atdTimestamps: (item.atdTimestamps as TimestampEntry[]) ?? (item.atd_timestamps as TimestampEntry[]) ?? null,
    ataTimestamps: (item.ataTimestamps as TimestampEntry[]) ?? (item.ata_timestamps as TimestampEntry[]) ?? null,
    originLocation: (item.originLocation ?? item.origin_location ?? null) as FacilityLocation,
    destinationLocation: (item.destinationLocation ?? item.destination_location ?? null) as FacilityLocation,
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

export default function ShipmentListPage() {
  const t = useT()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null)
  const refreshRef = React.useRef<() => void>(() => {})

  const columns = useMemo<ColumnDef[]>(
    () => [
      {
        data: 'containerNumber',
        title: t('shipment_tracking.shipments.fields.containerNumber', 'Container'),
        width: 140,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-medium font-mono text-sm tracking-wider">
            {String(value || '-')}
          </span>
        ),
      },
      {
        data: 'bookingNumber',
        title: t('shipment_tracking.shipments.fields.bookingNumber', 'Booking'),
        width: 130,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-medium font-mono text-sm tracking-wider">
            {String(value || '-')}
          </span>
        ),
      },
      {
        data: 'isoEquipmentCode',
        title: t('shipment_tracking.shipments.fields.size', 'Size'),
        width: 70,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-mono text-sm">
            {String(value || '-')}
          </span>
        ),
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

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Are you sure you want to delete this shipment?')) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/shipments', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash('Shipment deleted', 'success')
        refreshRef.current()
      } catch {
        flash('Failed to delete shipment', 'error')
      }
    },
    [],
  )

  const handleEdit = useCallback((id: string) => {
    setDrawerMode('edit')
    setSelectedShipmentId(id)
    setEditDrawerOpen(true)
  }, [])

  const handleView = useCallback((id: string) => {
    setSelectedShipmentId(id)
    setDetailsDrawerOpen(true)
  }, [])

  const handleRowClick = useCallback((_rowIndex: number, rowData: Record<string, unknown>) => {
    const id = rowData?.id as string | undefined
    if (id) {
      setSelectedShipmentId(id)
      setDetailsDrawerOpen(true)
    }
  }, [])

  const actionsRenderer = useCallback(
    (rowData: { id: string }) => {
      if (!rowData?.id) return null
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleView(rowData.id)
            }}
            className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
            title="View details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleEdit(rowData.id)
            }}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit shipment"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(rowData.id)
            }}
            className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete shipment"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    },
    [handleView, handleEdit, handleDelete],
  )

  const createButton = useMemo(
    () => (
      <Button onClick={() => {
        setDrawerMode('create')
        setSelectedShipmentId(null)
        setEditDrawerOpen(true)
      }}>
        {t('shipment_tracking.shipments.create', 'Create Shipment')}
      </Button>
    ),
    [t],
  )

  const table = useDynamicTablePage<ShipmentRow>({
    source: '/api/shipment_tracking/shipments',
    columns,
    tableName: t('shipment_tracking.shipments.title', 'Shipments'),
    defaultPageSize: 20,
    mapApiItem: mapItem,
    cellEdit: false,
    tableProps: {
      height: 'calc(100vh - 110px)',
      onRowClick: handleRowClick,
      actionsRenderer,
      uiConfig: {
        readOnlyStyle: 'normal',
        hideFilterButton: true,
        hideAddRowButton: true,
        hideBottomBar: true,
        topBarEnd: createButton,
      },
    },
  })

  refreshRef.current = table.refresh

  // Auto-open details drawer when ?shipment= query param is present (e.g., from notifications)
  useEffect(() => {
    const shipmentId = searchParams.get('shipment')
    if (shipmentId) {
      setSelectedShipmentId(shipmentId)
      setDetailsDrawerOpen(true)
      router.replace('/backend/shipment-tracking', { scroll: false })
    }
  }, [searchParams, router])

  if (table.isLoading) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={8} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <DynamicTable {...table.props} />

        <ShipmentDrawer
          open={editDrawerOpen}
          onOpenChange={setEditDrawerOpen}
          mode={drawerMode}
          shipmentId={selectedShipmentId ?? undefined}
          onSaved={() => {
            table.refresh()
          }}
        />

        <ShipmentDetailsDrawer
          open={detailsDrawerOpen}
          onOpenChange={setDetailsDrawerOpen}
          shipmentId={selectedShipmentId}
        />
      </PageBody>
    </Page>
  )
}
