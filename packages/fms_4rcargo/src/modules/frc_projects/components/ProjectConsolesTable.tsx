'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import { Eye } from 'lucide-react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type ProjectConsoleData = {
  id: string
  name: string
  date: string
  status: string
  truck: { id: string; name: string } | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
}

interface ProjectConsolesTableProps {
  consoles: ProjectConsoleData[]
  onViewConsole: (consoleId: string) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planning: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  loaded: { bg: '#d1fae5', text: '#065f46' },
  completed: { bg: '#e5e7eb', text: '#374151' },
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

const statusRenderer = (value: unknown) => {
  const status = value as string
  const colors = STATUS_COLORS[status] || { bg: '#f3f4f6', text: '#374151' }
  return (
    <span
      className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
      }}
    >
      {status}
    </span>
  )
}

export function ProjectConsolesTable({
  consoles,
  onViewConsole,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ProjectConsolesTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: t('frc_projects.detail.consoles.name', 'Name'),
      width: 180,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'date',
      title: t('frc_projects.detail.consoles.date', 'Date'),
      width: 100,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'truckName',
      title: t('frc_projects.detail.consoles.truck', 'Truck'),
      width: 120,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'route',
      title: t('frc_projects.detail.consoles.route', 'Route'),
      width: 120,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'status',
      title: t('frc_projects.detail.consoles.status', 'Status'),
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: statusRenderer,
    },
  ], [t])

  const tableData = useMemo(() =>
    consoles.map((console_) => ({
      id: console_.id,
      name: console_.name,
      date: formatDate(console_.date),
      truckName: console_.truck?.name ?? '-',
      route: `${console_.originAirport?.code ?? '?'} - ${console_.destinationAirport?.code ?? '?'}`,
      status: console_.status,
    })),
  [consoles])

  const handleRowClick = useCallback((_rowIndex: number, rowData: Record<string, unknown>) => {
    const consoleId = rowData.id as string
    onViewConsole(consoleId)
  }, [onViewConsole])

  if (consoles.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_projects.detail.consoles.empty', 'No truck loading consoles for this project.')}
      </div>
    )
  }

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
          hideBottomBar: true,
          hideFilterButton: true,
        }}
        actionsRenderer={(rowData: Record<string, unknown>) => (
          <button
            onClick={() => onViewConsole(rowData.id as string)}
            className="p-1 text-muted-foreground hover:text-primary transition-colors"
            title={t('frc_projects.detail.consoles.view', 'View console')}
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
        onRowClick={handleRowClick}
      />
    </div>
  )
}
