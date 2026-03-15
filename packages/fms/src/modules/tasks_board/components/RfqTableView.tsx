import React, { useMemo, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  DynamicTable,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import type { FmsRfqStatus } from '../../fms_offers/data/types'
import type { RfqTableRow } from '../lib/types'

const RFQ_STATUS_OPTIONS = ['incoming', 'in_progress', 'waiting_for_client', 'approved', 'declined']

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    incoming: 'bg-indigo-100 text-indigo-800',
    in_progress: 'bg-amber-100 text-amber-800',
    waiting_for_client: 'bg-purple-100 text-purple-800',
    approved: 'bg-emerald-100 text-emerald-800',
    declined: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

const StatusRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const label = value.replace(/_/g, ' ')
  return (
    <span
      className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full capitalize ${getStatusColor(value)}`}
    >
      {label}
    </span>
  )
}

const DateRenderer = ({ value }: { value: string }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  const date = new Date(value)
  return <span>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
}

interface RfqTableViewProps {
  searchQuery: string
  onRowClick: (row: RfqTableRow) => void
}

export function RfqTableView({ searchQuery, onRowClick }: RfqTableViewProps) {
  const t = useT()

  const extraParams = useMemo(() => {
    if (!searchQuery.trim()) return undefined
    return { q: searchQuery.trim() }
  }, [searchQuery])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'title',
      title: t('tasks_board.table.title', 'Title'),
      width: 200,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => (
        <span className="font-medium text-foreground truncate">{value || '-'}</span>
      ),
    },
    {
      data: 'status',
      title: t('tasks_board.table.status', 'Status'),
      width: 130,
      type: 'dropdown',
      readOnly: false,
      source: RFQ_STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, ' ').toUpperCase() })),
      renderer: (value: string) => <StatusRenderer value={value} />,
    },
    {
      data: 'companyName',
      title: t('tasks_board.table.company', 'Company'),
      width: 150,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => <span className="truncate">{value || '-'}</span>,
    },
    {
      data: 'origin',
      title: t('tasks_board.table.origin', 'Origin'),
      width: 130,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => <span className="truncate">{value || '-'}</span>,
    },
    {
      data: 'destination',
      title: t('tasks_board.table.destination', 'Destination'),
      width: 130,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => <span className="truncate">{value || '-'}</span>,
    },
    {
      data: 'direction',
      title: t('tasks_board.table.direction', 'Direction'),
      width: 90,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => <span className="capitalize">{value || '-'}</span>,
    },
    {
      data: 'transportMode',
      title: t('tasks_board.table.transportMode', 'Transport'),
      width: 90,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => <span className="capitalize">{value || '-'}</span>,
    },
    {
      data: 'contactPerson',
      title: t('tasks_board.table.contact', 'Contact'),
      width: 130,
      type: 'text',
      readOnly: true,
      renderer: (value: string) => <span className="truncate">{value || '-'}</span>,
    },
    {
      data: 'updatedAt',
      title: t('tasks_board.table.updated', 'Updated'),
      width: 90,
      type: 'date',
      readOnly: true,
      renderer: (value: string) => <DateRenderer value={value} />,
    },
    {
      data: 'createdAt',
      title: t('tasks_board.table.created', 'Created'),
      width: 90,
      type: 'date',
      readOnly: true,
      renderer: (value: string) => <DateRenderer value={value} />,
    },
  ], [t])

  const table = useDynamicTablePage<RfqTableRow>({
    source: '/api/fms_offers/rfq',
    columns,
    tableName: 'RFQs',
    queryKey: 'rfq-table',
    defaultSort: { field: 'updatedAt', direction: 'desc' },
    extraParams,
    cellEdit: {
      method: 'PUT',
    },
    mapApiItem: (item: any): RfqTableRow => ({
      id: item.id,
      title: item.title || '',
      status: item.status,
      companyName: item.companyName || null,
      origin: item.origin || null,
      destination: item.destination || null,
      direction: item.direction || null,
      transportMode: item.transportMode || null,
      cargoType: item.cargoType || null,
      contactPerson: item.contactPerson || null,
      assignedToId: item.assignedToId || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }),
    tableProps: {
      height: 'calc(100vh - 130px)',
      uiConfig: {
        hideToolbar: true,
        readOnlyStyle: 'normal',
        rowHoverStyle: 'accent',
      },
    },
  })

  const handleRowAction = useCallback(
    (actionId: string, rowData: unknown) => {
      if (actionId === 'view') {
        onRowClick(rowData as RfqTableRow)
      }
    },
    [onRowClick],
  )

  return (
    <div className="h-full">
      <DynamicTable
        {...table.props}
        onRowClick={(row: unknown) => onRowClick(row as RfqTableRow)}
        onRowAction={handleRowAction}
      />
    </div>
  )
}
