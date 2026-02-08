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

type WebhookRow = {
  id: string
  url: string
  eventsSubscribed: string[]
  isActive: boolean
  createdAt: string | null
}

type ListResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
}

function mapItem(item: Record<string, unknown>): WebhookRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null

  const eventsRaw = item.eventsSubscribed ?? item.events_subscribed
  const eventsSubscribed = Array.isArray(eventsRaw) ? eventsRaw as string[] : []

  return {
    id,
    url: (item.url as string) ?? '',
    eventsSubscribed,
    isActive: item.isActive === true || item.is_active === true,
    createdAt: (item.createdAt as string) ?? (item.created_at as string) ?? null,
  }
}

type ActionHandlers = {
  onDelete: (id: string) => void
  onTest: (id: string) => void
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
      label: localT('shipment_tracking.webhooks.actions.test', 'Test Webhook'),
      onSelect: () => actionHandlersRef?.onTest(id),
    },
    {
      label: 'Delete',
      onSelect: () => actionHandlersRef?.onDelete(id),
      destructive: true,
    },
  ]
  return <RowActions items={items} />
}

export default function WebhooksPage() {
  const t = useT()
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [rows, setRows] = React.useState<WebhookRow[]>([])
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
        `/api/shipment_tracking/webhooks?${params.toString()}`,
      )

      setRows((result?.items ?? []).map(mapItem).filter((x): x is WebhookRow => x !== null))
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    } catch {
      flash('Failed to load webhooks', 'error')
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
      if (!confirm('Delete this webhook?')) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/webhooks', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash('Webhook deleted', 'success')
        fetchData()
      } catch {
        flash('Failed to delete webhook', 'error')
      }
    },
    [fetchData],
  )

  const handleTest = React.useCallback(
    async (id: string) => {
      try {
        await apiCallOrThrow('/api/shipment_tracking/webhooks', {
          method: 'PUT',
          body: JSON.stringify({ id, _action: 'test' }),
        })
        flash('Test webhook dispatched', 'success')
      } catch {
        flash('Failed to send test webhook', 'error')
      }
    },
    [],
  )

  React.useEffect(() => {
    setActionHandlers({ onDelete: handleDelete, onTest: handleTest })
    setTRef(t)
    return () => {
      setActionHandlers(null)
      setTRef(null)
    }
  }, [handleDelete, handleTest, t])

  const columns = React.useMemo<ColumnDef[]>(
    () => [
      {
        data: 'url',
        title: t('shipment_tracking.webhooks.fields.url', 'URL'),
        width: 300,
        readOnly: true,
        renderer: (value: unknown) => (
          <span className="font-medium text-sm truncate max-w-[280px] block">{String(value ?? '')}</span>
        ),
      },
      {
        data: 'eventsSubscribed',
        title: t('shipment_tracking.webhooks.fields.eventsSubscribed', 'Subscribed Events'),
        width: 300,
        readOnly: true,
        renderer: (value: unknown) => {
          const events = Array.isArray(value) ? value : []
          return <span className="text-sm">{events.join(', ') || '-'}</span>
        },
      },
      {
        data: 'isActive',
        title: t('shipment_tracking.webhooks.fields.isActive', 'Active'),
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
        url: row.url,
        eventsSubscribed: row.eventsSubscribed,
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
            tableName={t('shipment_tracking.webhooks.title', 'Webhooks')}
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
            emptyMessage="No webhooks found."
          />
        </div>
      </PageBody>
    </Page>
  )
}
