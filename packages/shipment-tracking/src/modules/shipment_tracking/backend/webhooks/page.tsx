'use client'

import * as React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
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
import { WebhookDrawer } from '../../components/WebhookDrawer'

type WebhookRow = {
  id: string
  url: string
  eventsSubscribed: string[]
  isActive: boolean
  createdAt: string | null
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

export default function WebhooksPage() {
  const t = useT()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | undefined>(undefined)

  const columns = useMemo<ColumnDef[]>(
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

  const handleRowClick = useCallback((_rowIndex: number, rowData: Record<string, unknown>) => {
    const id = rowData?.id as string | undefined
    if (id) {
      setDrawerMode('edit')
      setSelectedWebhookId(id)
      setDrawerOpen(true)
    }
  }, [])

  const createButton = useMemo(
    () => (
      <Button onClick={() => {
        setDrawerMode('create')
        setSelectedWebhookId(undefined)
        setDrawerOpen(true)
      }}>
        {t('shipment_tracking.webhooks.create', 'Create Webhook')}
      </Button>
    ),
    [t],
  )

  const table = useDynamicTablePage<WebhookRow>({
    source: '/api/shipment_tracking/webhooks',
    columns,
    tableName: t('shipment_tracking.webhooks.title', 'Webhooks'),
    defaultPageSize: 20,
    mapApiItem: mapItem,
    cellEdit: false,
    tableProps: {
      height: 'calc(100vh - 110px)',
      onRowClick: handleRowClick,
      uiConfig: {
        readOnlyStyle: 'normal',
        hideFilterButton: true,
        hideAddRowButton: true,
        hideBottomBar: true,
        topBarEnd: createButton,
      },
    },
  })

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this webhook?')) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/webhooks', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash('Webhook deleted', 'success')
        table.refresh()
      } catch {
        flash('Failed to delete webhook', 'error')
      }
    },
    [table.refresh],
  )

  const handleTest = useCallback(
    async (id: string) => {
      try {
        const { result } = await apiCallOrThrow<{ success: boolean; deliveryId: string }>(
          '/api/shipment_tracking/webhooks/test',
          {
            method: 'POST',
            body: JSON.stringify({ id }),
          }
        )
        if (result?.success) {
          flash(t('shipment_tracking.webhooks.flash.testSent', 'Test webhook sent successfully'), 'success')
        } else {
          flash(t('shipment_tracking.webhooks.flash.testFailed', 'Failed to send test webhook'), 'error')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : t('shipment_tracking.webhooks.flash.testFailed', 'Failed to send test webhook')
        flash(message, 'error')
      }
    },
    [t],
  )

  const actionsRenderer = useCallback(
    (rowData: { id: string }) => {
      if (!rowData?.id) return null
      const items: RowActionItem[] = [
        {
          label: t('shipment_tracking.webhooks.actions.test', 'Test Webhook'),
          onSelect: () => handleTest(rowData.id),
        },
        {
          label: 'Delete',
          onSelect: () => handleDelete(rowData.id),
          destructive: true,
        },
      ]
      return <RowActions items={items} />
    },
    [t, handleTest, handleDelete],
  )

  if (table.isLoading) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={3} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <DynamicTable
          {...table.props}
          actionsRenderer={actionsRenderer}
        />

        <WebhookDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          mode={drawerMode}
          webhookId={selectedWebhookId}
          onSaved={() => {
            table.refresh()
          }}
        />
      </PageBody>
    </Page>
  )
}
