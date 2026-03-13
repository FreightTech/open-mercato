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

export default function LocationOverridesPage() {
  const t = useT()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [selectedOverrideId, setSelectedOverrideId] = useState<string | undefined>(undefined)

  const columns = useMemo<ColumnDef[]>(
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

  const handleRowClick = useCallback((_rowIndex: number, rowData: Record<string, unknown>) => {
    const id = rowData?.id as string | undefined
    if (id) {
      setDrawerMode('edit')
      setSelectedOverrideId(id)
      setDrawerOpen(true)
    }
  }, [])

  const createButton = useMemo(
    () => (
      <Button onClick={() => {
        setDrawerMode('create')
        setSelectedOverrideId(undefined)
        setDrawerOpen(true)
      }}>
        {t('shipment_tracking.location_overrides.create', 'Create Override')}
      </Button>
    ),
    [t],
  )

  const table = useDynamicTablePage<LocationOverrideRow>({
    source: '/api/shipment_tracking/location-overrides',
    columns,
    tableName: t('shipment_tracking.location_overrides.title', 'Location Overrides'),
    defaultPageSize: 20,
    mapApiItem: mapItem,
    cellEdit: false,
    tableProps: {
      height: 'fill',
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
      if (!confirm(t('shipment_tracking.location_overrides.confirm.delete', 'Delete this location override?'))) return

      try {
        await apiCallOrThrow('/api/shipment_tracking/location-overrides', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        })
        flash(t('shipment_tracking.location_overrides.deleted', 'Location override deleted'), 'success')
        table.refresh()
      } catch {
        flash(t('shipment_tracking.location_overrides.errors.deleteFailed', 'Failed to delete location override'), 'error')
      }
    },
    [t, table.refresh],
  )

  const actionsRenderer = useCallback(
    (rowData: { id: string }) => {
      if (!rowData?.id) return null
      const items: RowActionItem[] = [
        {
          label: t('common.actions.delete', 'Delete'),
          onSelect: () => handleDelete(rowData.id),
          destructive: true,
        },
      ]
      return <RowActions items={items} />
    },
    [t, handleDelete],
  )

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
          actionsRenderer={actionsRenderer}
        />

        <LocationOverrideDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          mode={drawerMode}
          overrideId={selectedOverrideId}
          onSaved={() => {
            table.refresh()
          }}
        />
      </PageBody>
    </Page>
  )
}
