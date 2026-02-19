'use client'

import * as React from 'react'
import { Plane, ArrowRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@open-mercato/ui/primitives/table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type AirRoutingItem = {
  id: string
  name: string
  type: string
  flightNumber: string | null
  departureDate: string | null
  departureTime: string | null
  arrivalDate: string | null
  arrivalTime: string | null
}

export type AirRoutingTableProps = {
  items: AirRoutingItem[]
}

const TYPE_LABELS: Record<string, string> = {
  direct_pickup_truck_management: 'Truck Pickup',
  direct_flight: 'Direct Flight',
  connecting_flight: 'Connecting Flight',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  direct_pickup_truck_management: <span className="text-amber-600">Truck</span>,
  direct_flight: <Plane className="h-3 w-3 text-blue-600" />,
  connecting_flight: <Plane className="h-3 w-3 text-purple-600" />,
}

function formatDateTime(date: string | null, time: string | null): string {
  if (!date) return '-'
  try {
    const d = new Date(date)
    const dateStr = d.toLocaleDateString()
    return time ? `${dateStr} ${time}` : dateStr
  } catch {
    return date
  }
}

export function AirRoutingTable({ items }: AirRoutingTableProps) {
  const t = useT()

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_offers.detail.routing.empty', 'No routing legs defined')}
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[40px] text-center">#</TableHead>
            <TableHead>{t('frc_offers.detail.routing.type', 'Type')}</TableHead>
            <TableHead>{t('frc_offers.detail.routing.flight', 'Flight')}</TableHead>
            <TableHead>{t('frc_offers.detail.routing.departure', 'Departure')}</TableHead>
            <TableHead>{t('frc_offers.detail.routing.arrival', 'Arrival')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.id}>
              <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {TYPE_ICONS[item.type] ?? <Plane className="h-3 w-3" />}
                  <span className="text-sm">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {item.flightNumber ? (
                  <span className="font-mono text-sm">{item.flightNumber}</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {formatDateTime(item.departureDate, item.departureTime)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {formatDateTime(item.arrivalDate, item.arrivalTime)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
