"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type TrackingJobRow = {
  id: string
  carrierName: string
  referenceType: string
  referenceValue: string
  status: string
  nextPollAt: string | null
  lastPollAt: string | null
  retryCount: number
  createdAt: string | null
}

type ListResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  page?: number
  totalPages?: number
}

function mapItem(item: Record<string, unknown>): TrackingJobRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null

  return {
    id,
    carrierName: (item.carrierName as string) ?? (item.carrier_name as string) ?? '',
    referenceType: (item.referenceType as string) ?? (item.reference_type as string) ?? '',
    referenceValue: (item.referenceValue as string) ?? (item.reference_value as string) ?? '',
    status: (item.status as string) ?? 'active',
    nextPollAt: (item.nextPollAt as string) ?? (item.next_poll_at as string) ?? null,
    lastPollAt: (item.lastPollAt as string) ?? (item.last_poll_at as string) ?? null,
    retryCount: typeof item.retryCount === 'number' ? item.retryCount : (typeof item.retry_count === 'number' ? item.retry_count : 0),
    createdAt: (item.createdAt as string) ?? (item.created_at as string) ?? null,
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

const JOB_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  deactivated: 'bg-gray-100 text-gray-700',
  failed: 'bg-red-100 text-red-700',
}

type ActionHandler = (id: string, action: 'pause' | 'resume' | 'deactivate') => void
type RowDataForActions = { id: string; status: string }

let actionHandlerRef: ActionHandler | null = null
let tRef: ((key: string, fallback: string) => string) | null = null

function setActionHandler(handler: ActionHandler | null) {
  actionHandlerRef = handler
}

function setTRef(handler: typeof tRef) {
  tRef = handler
}

const ActionsCell = ({ id, status }: RowDataForActions) => {
  if (!id) return null
  const localT = tRef || ((_k: string, fb: string) => fb)
  const items: RowActionItem[] = []

  if (status === 'active') {
    items.push({
      label: localT('shipment_tracking.tracking_jobs.actions.pause', 'Pause'),
      onSelect: () => actionHandlerRef?.(id, 'pause'),
    })
  }

  if (status === 'paused' || status === 'failed') {
    items.push({
      label: localT('shipment_tracking.tracking_jobs.actions.resume', 'Resume'),
      onSelect: () => actionHandlerRef?.(id, 'resume'),
    })
  }

  if (status !== 'deactivated') {
    items.push({
      label: localT('shipment_tracking.tracking_jobs.actions.deactivate', 'Deactivate'),
      onSelect: () => actionHandlerRef?.(id, 'deactivate'),
      destructive: true,
    })
  }

  if (items.length === 0) return null
  return <RowActions items={items} />
}

export default function TrackingJobsPage() {
  const t = useT()
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [rows, setRows] = React.useState<TrackingJobRow[]>([])
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
        `/api/shipment_tracking/tracking-jobs?${params.toString()}`,
      )

      setRows((result?.items ?? []).map(mapItem).filter((x): x is TrackingJobRow => x !== null))
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    } catch {
      flash('Failed to load tracking jobs', 'error')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAction = React.useCallback(
    async (jobId: string, action: 'pause' | 'resume' | 'deactivate') => {
      const commandMap = {
        pause: 'PUT',
        resume: 'PUT',
        deactivate: 'DELETE',
      }

      try {
        await apiCallOrThrow('/api/shipment_tracking/tracking-jobs', {
          method: commandMap[action],
          body: JSON.stringify({ id: jobId, status: action === 'resume' ? 'active' : action === 'pause' ? 'paused' : undefined }),
        })
        flash(`Job ${action}d`, 'success')
        fetchData()
      } catch {
        flash(`Failed to ${action} job`, 'error')
      }
    },
    [fetchData],
  )

  React.useEffect(() => {
    setActionHandler(handleAction)
    setTRef(t)
    return () => {
      setActionHandler(null)
      setTRef(null)
    }
  }, [handleAction, t])

  const columns = React.useMemo<ColumnDef[]>(
    () => [
      {
        data: 'referenceValue',
        title: 'Reference',
        width: 200,
        readOnly: true,
        renderer: (value: unknown, rowData: Record<string, unknown>) => (
          <div>
            <span className="font-medium">{String(value ?? '')}</span>
            <span className="text-xs text-muted-foreground ml-2">({String(rowData.referenceType ?? '')})</span>
          </div>
        ),
      },
      {
        data: 'carrierName',
        title: t('shipment_tracking.tracking_jobs.fields.carrierName', 'Carrier'),
        width: 130,
        readOnly: true,
      },
      {
        data: 'status',
        title: t('shipment_tracking.tracking_jobs.fields.status', 'Status'),
        width: 110,
        readOnly: true,
        renderer: (value: unknown) => {
          const status = String(value ?? '')
          const colorClass = JOB_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
              {t(`shipment_tracking.tracking_jobs.statuses.${status}`, status)}
            </span>
          )
        },
      },
      {
        data: 'nextPollAt',
        title: t('shipment_tracking.tracking_jobs.fields.nextPollAt', 'Next Poll'),
        width: 170,
        readOnly: true,
        renderer: (value: unknown) => formatDateTime(value as string | null),
      },
      {
        data: 'lastPollAt',
        title: t('shipment_tracking.tracking_jobs.fields.lastPollAt', 'Last Poll'),
        width: 170,
        readOnly: true,
        renderer: (value: unknown) => formatDateTime(value as string | null),
      },
      {
        data: 'retryCount',
        title: t('shipment_tracking.tracking_jobs.fields.retryCount', 'Retries'),
        width: 80,
        readOnly: true,
      },
    ],
    [t],
  )

  const tableData = React.useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        referenceValue: row.referenceValue,
        referenceType: row.referenceType,
        carrierName: row.carrierName,
        status: row.status,
        nextPollAt: row.nextPollAt ?? '',
        lastPollAt: row.lastPollAt ?? '',
        retryCount: row.retryCount,
      })),
    [rows],
  )

  const actionsRenderer = React.useCallback(
    (rowData: { id: string; status: string }) => {
      if (!rowData?.id) return null
      return <ActionsCell id={rowData.id} status={rowData.status} />
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
            tableName={t('shipment_tracking.tracking_jobs.title', 'Tracking Jobs')}
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
            emptyMessage="No tracking jobs found."
          />
        </div>
      </PageBody>
    </Page>
  )
}
