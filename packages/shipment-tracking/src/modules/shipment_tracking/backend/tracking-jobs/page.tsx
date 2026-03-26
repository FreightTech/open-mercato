'use client'

import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  DynamicTable,
  TableSkeleton,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TrackingJobDrawer } from '../../components/TrackingJobDrawer'

type TrackingJobRow = {
  id: string
  carrierCode: string
  referenceType: string
  referenceValue: string
  status: string
  nextPollAt: string | null
  lastPollAt: string | null
  retryCount: number
  createdAt: string | null
}

function mapItem(item: Record<string, unknown>): TrackingJobRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null

  return {
    id,
    carrierCode: (item.carrierCode as string) ?? (item.carrier_code as string) ?? '',
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

export default function TrackingJobsPage() {
  const t = useT()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined)
  const refreshRef = useRef<() => void>(() => {})

  const handleAction = useCallback(
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
        refreshRef.current()
      } catch {
        flash(`Failed to ${action} job`, 'error')
      }
    },
    [],
  )

  const handleSync = useCallback(async (jobId: string) => {
    try {
      const result = await apiCallOrThrow('/api/shipment_tracking/tracking-jobs/sync', {
        method: 'POST',
        body: JSON.stringify({ id: jobId }),
      })
      const data = result as { newEvents?: number; shipmentsCreated?: number }
      const eventCount = data.newEvents ?? 0
      const shipmentCount = data.shipmentsCreated ?? 0
      flash(
        eventCount > 0 || shipmentCount > 0
          ? `Sync complete: ${eventCount} new event(s), ${shipmentCount} shipment(s) created`
          : 'Sync complete — no new data',
        'success',
      )
      refreshRef.current()
    } catch {
      flash('Failed to sync tracking job', 'error')
    }
  }, [])

  const columns = useMemo<ColumnDef[]>(
    () => [
      {
        data: 'referenceValue',
        title: 'Reference',
        width: 200,
        readOnly: true,
        renderer: (value: unknown, rowData: Record<string, unknown>) => (
          <div>
            <span className="font-medium font-mono text-sm tracking-wider">{String(value ?? '')}</span>
            <span className="text-xs text-muted-foreground ml-2">({String(rowData.referenceType ?? '')})</span>
          </div>
        ),
      },
      {
        data: 'carrierCode',
        title: t('shipment_tracking.tracking_jobs.fields.carrierCode', 'Carrier'),
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

  const handleRowClick = useCallback((_rowIndex: number, rowData: Record<string, unknown>) => {
    const id = rowData?.id as string | undefined
    if (id) {
      setDrawerMode('edit')
      setSelectedJobId(id)
      setDrawerOpen(true)
    }
  }, [])

  const createButton = useMemo(
    () => (
      <Button onClick={() => {
        setDrawerMode('create')
        setSelectedJobId(undefined)
        setDrawerOpen(true)
      }}>
        {t('shipment_tracking.tracking_jobs.create', 'Create Tracking Job')}
      </Button>
    ),
    [t],
  )

  const actionsRenderer = useCallback(
    (rowData: Record<string, unknown>) => {
      const id = rowData?.id as string | undefined
      const status = rowData?.status as string | undefined
      if (!id) return null

      const items: RowActionItem[] = []

      if (status === 'active') {
        items.push({
          label: t('shipment_tracking.tracking_jobs.actions.triggerSync', 'Trigger Sync'),
          onSelect: () => handleSync(id),
        })
        items.push({
          label: t('shipment_tracking.tracking_jobs.actions.pause', 'Pause'),
          onSelect: () => handleAction(id, 'pause'),
        })
      }

      if (status === 'paused' || status === 'failed') {
        items.push({
          label: t('shipment_tracking.tracking_jobs.actions.resume', 'Resume'),
          onSelect: () => handleAction(id, 'resume'),
        })
      }

      if (status !== 'deactivated') {
        items.push({
          label: t('shipment_tracking.tracking_jobs.actions.deactivate', 'Deactivate'),
          onSelect: () => handleAction(id, 'deactivate'),
          destructive: true,
        })
      }

      if (items.length === 0) return null
      return <RowActions items={items} />
    },
    [t, handleAction, handleSync],
  )

  const table = useDynamicTablePage<TrackingJobRow>({
    source: '/api/shipment_tracking/tracking-jobs',
    columns,
    tableName: t('shipment_tracking.tracking_jobs.title', 'Tracking Jobs'),
    defaultPageSize: 20,
    mapApiItem: mapItem,
    cellEdit: false,
    tableProps: {
      height: 'fill',
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

  useEffect(() => {
    refreshRef.current = table.refresh
  }, [table.refresh])

  if (table.isLoading) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={6} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <DynamicTable
          {...table.props}
        />

        <TrackingJobDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          mode={drawerMode}
          trackingJobId={selectedJobId}
          onSaved={() => {
            table.refresh()
          }}
        />
      </PageBody>
    </Page>
  )
}
