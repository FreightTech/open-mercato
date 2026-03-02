'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { FRC_OFFER_STATUSES, FRC_CONNECTION_METHODS } from '../../../lib/types'
import { formatDateForApi } from '../../../lib/dateUtils'
import { loadInitialUsers } from '../../../lib/loadInitialUsers'

export type OfferDetailsData = {
  id: string
  name: string
  status: string
  awbNumber: string | null
  connectionMethod: string | null
  departureDate: string | null
  rfqId: string | null
  rfqName: string | null
  assignedToId: string | null
  assignedToName: string | null
}

interface OfferDetailsEditTableProps {
  offerId: string
  data: OfferDetailsData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const STATUS_OPTIONS = FRC_OFFER_STATUSES.map((s) => s)
const CONNECTION_METHOD_OPTIONS = ['', ...FRC_CONNECTION_METHODS]

// User renderer for Assigned To column
const UserNameRenderer = (value: unknown, row: Record<string, unknown>) => {
  const assignedToName = row.assignedToName as string | null
  // Value might be JSON from EntitySearchEditor
  let displayName = assignedToName || value
  if (typeof displayName === 'string' && displayName.startsWith('{')) {
    try {
      const parsed = JSON.parse(displayName)
      displayName = parsed.name || displayName
    } catch {
      // Use value as-is
    }
  }
  if (!displayName) return <span className="text-muted-foreground">-</span>
  return <span className="text-foreground">{String(displayName)}</span>
}

export function OfferDetailsEditTable({
  offerId,
  data,
  onFieldSave,
  tableRef: externalTableRef,
  siblingTableRefs,
}: OfferDetailsEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // User editor config for assigned to field
  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
      }),
    placeholder: 'Search users...',
    minQueryLength: 2,
    initialSuggestions: {
      loadItems: loadInitialUsers,
      limit: 4,
    },
  }), [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: t('frc_offers.detail.columns.name', 'Offer Name'),
      width: 200,
      type: 'text',
    },
    {
      data: 'status',
      title: t('frc_offers.detail.columns.status', 'Status'),
      width: 120,
      type: 'dropdown',
      source: STATUS_OPTIONS,
    },
    {
      data: 'awbNumber',
      title: t('frc_offers.detail.columns.awbNumber', 'AWB Number'),
      width: 130,
      type: 'text',
    },
    {
      data: 'connectionMethod',
      title: t('frc_offers.detail.columns.connectionMethod', 'Connection Method'),
      width: 150,
      type: 'dropdown',
      source: CONNECTION_METHOD_OPTIONS,
    },
    {
      data: 'departureDate',
      title: t('frc_offers.detail.columns.departureDate', 'Departure Date'),
      width: 130,
      type: 'date',
    },
    {
      data: 'rfqName',
      title: t('frc_offers.detail.columns.linkedRfq', 'Linked Opportunity'),
      width: 180,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => {
        const rfqId = row.rfqId as string | null
        const rfqName = value as string | null
        if (!rfqId || !rfqName) return <span className="text-muted-foreground">-</span>
        return (
          <Link
            href={`/backend/frc-rfqs/${rfqId}`}
            className="text-primary hover:underline"
          >
            {rfqName}
          </Link>
        )
      },
    },
    {
      data: 'assignedToName',
      title: t('frc_offers.detail.columns.assignedTo', 'Assigned To'),
      width: 150,
      type: 'text',
      renderer: UserNameRenderer,
      editor: createEntitySearchEditor(userEditorConfig),
    },
  ], [t, userEditorConfig])

  const tableData = useMemo(() => [{
    id: data.id,
    name: data.name,
    status: data.status,
    awbNumber: data.awbNumber ?? '',
    connectionMethod: data.connectionMethod ?? '',
    departureDate: data.departureDate ?? '',
    rfqId: data.rfqId,
    rfqName: data.rfqName ?? '',
    assignedToId: data.assignedToId,
    assignedToName: data.assignedToName ?? '',
  }], [data])

  const handleCellSave = useCallback(async (field: string, value: unknown, rowIndex: number, colIndex: number) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex,
      colIndex,
    } as CellSaveStartEvent)

    try {
      let actualField = field
      let processedValue: unknown = value

      switch (field) {
        case 'name':
        case 'status':
          processedValue = String(value ?? '')
          break
        case 'awbNumber':
        case 'connectionMethod':
          processedValue = value ? String(value) : null
          break
        case 'departureDate':
          processedValue = formatDateForApi(value)
          break
        case 'assignedToName':
          // Parse JSON from entity search to get assignedToId
          actualField = 'assignedToId'
          try {
            const parsed = JSON.parse(String(value))
            processedValue = parsed.id || null
          } catch {
            // Not JSON, set assignedToId to null (unlinking)
            processedValue = value || null
          }
          break
      }

      await onFieldSave(actualField, processedValue)

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
        rowIndex,
        colIndex,
      } as CellSaveSuccessEvent)
    } catch (error) {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
        rowIndex,
        colIndex,
        error: error instanceof Error ? error.message : 'Failed to save',
      } as CellSaveErrorEvent)
    }
  }, [onFieldSave, tableRef])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        handleCellSave(payload.prop, payload.newValue, payload.rowIndex, payload.colIndex)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  return (
    <div className="border rounded-lg overflow-hidden">
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName=""
        idColumnName="id"
        width="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
}
