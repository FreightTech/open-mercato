'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type ProjectRoutingData = {
  id: string
  name: string
  type: string
  flightNumber: string | null
  originAirport: { id: string; code: string } | null
  destinationAirport: { id: string; code: string } | null
  departureDate: string | null
  departureTime: string | null
  arrivalDate: string | null
  arrivalTime: string | null
}

interface ProjectRoutingTableProps {
  routingItems: ProjectRoutingData[]
  onViewOffer?: () => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const ROUTING_TYPE_LABELS: Record<string, string> = {
  direct_pickup_truck_management: 'Truck',
  direct_flight: 'Direct',
  connecting_flight: 'Connection',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

export function ProjectRoutingTable({
  routingItems,
  onViewOffer,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ProjectRoutingTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'type',
      title: t('frc_projects.detail.routing.type', 'Type'),
      width: 90,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'flightNumber',
      title: t('frc_projects.detail.routing.flightNumber', 'Flight #'),
      width: 90,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'originAirportCode',
      title: t('frc_projects.detail.routing.origin', 'From'),
      width: 70,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'destinationAirportCode',
      title: t('frc_projects.detail.routing.destination', 'To'),
      width: 70,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'departureDate',
      title: t('frc_projects.detail.routing.departure', 'Departure'),
      width: 120,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'arrivalDate',
      title: t('frc_projects.detail.routing.arrival', 'Arrival'),
      width: 120,
      type: 'text',
      readOnly: true,
    },
  ], [t])

  const tableData = useMemo(() =>
    routingItems.map((routing) => ({
      id: routing.id,
      name: routing.name,
      type: ROUTING_TYPE_LABELS[routing.type] || routing.type,
      flightNumber: routing.flightNumber ?? '-',
      originAirportCode: routing.originAirport?.code ?? '-',
      destinationAirportCode: routing.destinationAirport?.code ?? '-',
      departureDate: routing.departureDate
        ? `${formatDate(routing.departureDate)}${routing.departureTime ? ` ${routing.departureTime}` : ''}`
        : '-',
      arrivalDate: routing.arrivalDate
        ? `${formatDate(routing.arrivalDate)}${routing.arrivalTime ? ` ${routing.arrivalTime}` : ''}`
        : '-',
    })),
  [routingItems])

  if (routingItems.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_projects.detail.routing.empty', 'No routing legs linked to this project.')}
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
          hideActionsColumn: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
        onRowClick={onViewOffer ? () => onViewOffer() : undefined}
      />
    </div>
  )
}
