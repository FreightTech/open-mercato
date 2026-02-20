"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableEvents,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { LocationOverrideDrawer } from '../../components/LocationOverrideDrawer'

type LocationOverrideRow = {
  id: string
  carrierCode: string | null
  unlocode: string
  facilityCode: string
  facilityCodeListProvider: 'BIC' | 'SMDG'
  overrideName: string
  description: string | null
  isActive: boolean
  createdAt: string | null
}

type ListResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
}

function mapItem(item: Record<string, unknown>): LocationOverrideRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null

  const overrideData = (item.overrideData ?? item.override_data) as Record<string, unknown> | null

  return {
    id,
    carrierCode: (item.carrierCode as string) ?? (item.carrier_code as string) ?? null,
    unlocode: (item.unlocode as string) ?? '',
    facilityCode: (item.facilityCode as string) ?? (item.facility_code as string) ?? '',
    facilityCodeListProvider: ((item.facilityCodeListProvider ?? item.facility_code_list_provider) as 'BIC' | 'SMDG') ?? 'SMDG',
    overrideName: (overrideData?.name as string) ?? '',
    description: (item.description as string) ?? null,
    isActive: item.isActive === true || item.is_active === true,
    createdAt: (item.createdAt as string) ?? (item.created_at as string) ?? null,
  }
}

type ActionHandlers = {
  onDelete: (id: string) => void
}

let actionHandlersRef: ActionHandlers | null = null
let tRef: ((key: string, fallback: string) => string) | null = null

function setActionHandlers(handlers: ActionHandlers | null) {
  actionHandlersRef = handlers
}

function setTRef(handler: typeof tRef) {
  tRef = handler
}

const ActionsCell = ({ id }: { id: string }) => {
  if (!id) return null
  const localT = tRef || ((_k: string, fb: string) => fb)
  const items: RowActionItem[] = [
    {
      label: localT('common.actions.delete', 'Delete'),
      onSelect: () => actionHandlersRef?.onDelete(id),
      destructive: true,
    },
  ]
  return <RowActions items={items} />
}

export default function LocationOverridesPage() {
  const t = useT()
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [rows, setRows] = React.useState<LocationOverrideRow[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create')
  const [selectedOverrideId, setSelectedOverrideId] = React.useState<string | undefined>(undefined)

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (search) params.set('search', search)

      const { result } = await apiCallOrThrow<ListResponse>(
        `/api/shipment_tracking/location-overrides?${params.toString()}`,
      )

      setRows((result?.items ?? []).map(mapItem).filter((x): x is LocationOverrideRow => x !== null))
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    } catch {
      flash(t('shipment_tracking.location_overrides.errors.fetchFailed', 'Failed to load location overrides'), 'error')
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
      if (!confirm(t('shipment_tracking.location_overrides.confirm.delete', 'Delete this location override?'))) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/location-overrides', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash(t('shipment_tracking.location_overrides.deleted', 'Location override deleted'), 'success')
        fetchData()
      } catch {
        flash(t('shipment_tracking.location_overrides.errors.deleteFailed', 'Failed to delete location override'), 'error')
      }
    },
    [fetchData, t],
  )

  React.useEffect(() => {
    setActionHandlers({ onDelete: handleDelete })
    setTRef(t)
    return () => {
      setActionHandlers(null)
      setTRef(null)
    }
  }, [handleDelete, t])

  const columns = React.useMemo<ColumnDef[]>(
    () => [
      {
        data: 'carrierCode',
        title: t('shipment_tracking.location_overrides.fields.carrierCode', 'Carrier'),
        width: 100,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-mono text-sm">
            {value ? String(value) : t('shipment_tracking.location_overrides.allCarriers', 'All Carriers')}
          </span>
        ),
      },
      {
        data: 'unlocode',
        title: t('shipment_tracking.location_overrides.fields.unlocode', 'UNLOCODE'),
        width: 90,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-mono text-sm tracking-wider">{String(value || '-')}</span>
        ),
      },
      {
        data: 'facilityCode',
        title: t('shipment_tracking.location_overrides.fields.facilityCode', 'Facility Code'),
        width: 120,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-mono text-sm tracking-wider">{String(value || '-')}</span>
        ),
      },
      {
        data: 'facilityCodeListProvider',
        title: t('shipment_tracking.location_overrides.fields.provider', 'Provider'),
        width: 80,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            value === 'BIC' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}>
            {String(value ?? 'SMDG')}
          </span>
        ),
      },
      {
        data: 'overrideName',
        title: t('shipment_tracking.location_overrides.fields.overrideName', 'Override Name'),
        width: 250,
        readOnly: true,
      },
      {
        data: 'isActive',
        title: t('shipment_tracking.location_overrides.fields.isActive', 'Active'),
        width: 70,
        readOnly: true,
        renderer: (value: unknown) => <BooleanIcon value={!!value} />,
      },
    ],
    [t],
  )

  const tableData = React.useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        carrierCode: row.carrierCode,
        unlocode: row.unlocode,
        facilityCode: row.facilityCode,
        facilityCodeListProvider: row.facilityCodeListProvider,
        overrideName: row.overrideName,
        isActive: row.isActive,
      })),
    [rows],
  )

  const actionsRenderer = React.useCallback(
    (rowData: { id: string }) => {
      if (!rowData?.id) return null
      return <ActionsCell id={rowData.id} />
    },
    [],
  )

  const handleRowClick = React.useCallback((_rowIndex: number, rowData: Record<string, unknown>) => {
    const id = rowData?.id as string | undefined
    if (id) {
      setDrawerMode('edit')
      setSelectedOverrideId(id)
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
            tableName={t('shipment_tracking.location_overrides.title', 'Location Overrides')}
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
                  setSelectedOverrideId(undefined)
                  setDrawerOpen(true)
                }}>
                  {t('shipment_tracking.location_overrides.create', 'Create Override')}
                </Button>
              ),
            }}
            emptyMessage={t('shipment_tracking.location_overrides.empty', 'No location overrides found.')}
          />
        </div>

        <LocationOverrideDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          mode={drawerMode}
          overrideId={selectedOverrideId}
          onSaved={() => {
            fetchData()
          }}
        />
      </PageBody>
    </Page>
  )
}
