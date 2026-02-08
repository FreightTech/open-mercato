"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import {
  DynamicTable,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type CarrierConfigRow = {
  id: string
  carrierName: string
  apiEndpoint: string | null
  rateLimitRequests: number
  rateLimitWindowSeconds: number
  isActive: boolean
  createdAt: string | null
}

type ListResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
}

function mapItem(item: Record<string, unknown>): CarrierConfigRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null

  return {
    id,
    carrierName: (item.carrierName as string) ?? '',
    apiEndpoint: (item.apiEndpoint as string) ?? null,
    rateLimitRequests: typeof item.rateLimitRequests === 'number' ? item.rateLimitRequests : 60,
    rateLimitWindowSeconds: typeof item.rateLimitWindowSeconds === 'number' ? item.rateLimitWindowSeconds : 60,
    isActive: item.isActive === true,
    createdAt: (item.createdAt as string) ?? null,
  }
}

let deleteHandlerRef: ((id: string) => void) | null = null

function setDeleteHandler(handler: ((id: string) => void) | null) {
  deleteHandlerRef = handler
}

const ActionsCell = ({ id }: { id: string }) => {
  if (!id) return null
  const items: RowActionItem[] = [
    {
      label: 'Delete',
      onSelect: () => deleteHandlerRef?.(id),
      destructive: true,
    },
  ]
  return <RowActions items={items} />
}

export default function CarrierConfigsPage() {
  const t = useT()
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [rows, setRows] = React.useState<CarrierConfigRow[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(false)

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })

      const { result } = await apiCallOrThrow<ListResponse>(
        `/api/shipment_tracking/carrier-configs?${params.toString()}`,
      )

      setRows((result?.items ?? []).map(mapItem).filter((x): x is CarrierConfigRow => x !== null))
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    } catch {
      flash('Failed to load carrier configs', 'error')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDelete = React.useCallback(
    async (id: string) => {
      if (!confirm('Delete this carrier config?')) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/carrier-configs', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash('Carrier config deleted', 'success')
        fetchData()
      } catch {
        flash('Failed to delete carrier config', 'error')
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
        data: 'carrierName',
        title: t('shipment_tracking.carrier_configs.fields.carrierName', 'Carrier Name'),
        width: 180,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-medium">{String(value ?? '')}</span>
        ),
      },
      {
        data: 'apiEndpoint',
        title: t('shipment_tracking.carrier_configs.fields.apiEndpoint', 'API Endpoint'),
        width: 280,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="text-sm truncate max-w-[260px] block">{String(value || '-')}</span>
        ),
      },
      {
        data: 'rateLimit',
        title: 'Rate Limit',
        width: 120,
        readOnly: true,
        renderer: (_value: unknown, rowData: Record<string, unknown>) => (
          <span className="text-sm">
            {String(rowData.rateLimitRequests ?? 60)} / {String(rowData.rateLimitWindowSeconds ?? 60)}s
          </span>
        ),
      },
      {
        data: 'isActive',
        title: t('shipment_tracking.carrier_configs.fields.isActive', 'Active'),
        width: 80,
        readOnly: true,
        renderer: (value: unknown) => <BooleanIcon value={value === true || value === 'true'} />,
      },
    ],
    [t],
  )

  const tableData = React.useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        carrierName: row.carrierName,
        apiEndpoint: row.apiEndpoint ?? '',
        rateLimitRequests: row.rateLimitRequests,
        rateLimitWindowSeconds: row.rateLimitWindowSeconds,
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

  useEventHandlers({}, tableRef as React.RefObject<HTMLElement>)

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
            tableName={t('shipment_tracking.carrier_configs.title', 'Carrier Configs')}
            idColumnName="id"
            width="100%"
            height="100%"
            colHeaders={true}
            rowHeaders={false}
            stretchColumns={true}
            actionsRenderer={actionsRenderer}
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
            }}
            emptyMessage="No carrier configs found."
          />
        </div>
      </PageBody>
    </Page>
  )
}
