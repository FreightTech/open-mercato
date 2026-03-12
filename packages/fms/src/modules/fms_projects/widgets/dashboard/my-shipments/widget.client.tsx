"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import type { MyShipmentsSettings } from './config'
import { Truck, MapPin, Calendar } from 'lucide-react'

type ShipmentItem = {
  id: string
  projectNo: string
  route: string
  carrier: string
  status: 'in_transit' | 'loading' | 'delivered' | 'pending_pickup'
  eta: string
}

const DUMMY_SHIPMENTS: ShipmentItem[] = [
  { id: '1', projectNo: 'PRJ-1042', route: 'Hamburg → Warsaw', carrier: 'Trans-Europa GmbH', status: 'in_transit', eta: 'Today, 16:00' },
  { id: '2', projectNo: 'PRJ-1051', route: 'Gdansk → Berlin', carrier: 'Baltic Logistics', status: 'in_transit', eta: 'Today, 19:30' },
  { id: '3', projectNo: 'PRJ-1053', route: 'Rotterdam → Prague', carrier: 'Nordspeed Sp. z o.o.', status: 'loading', eta: 'Tomorrow, 08:00' },
  { id: '4', projectNo: 'PRJ-1055', route: 'Antwerp → Vienna', carrier: 'Central Freight AG', status: 'pending_pickup', eta: 'Tomorrow, 12:00' },
  { id: '5', projectNo: 'PRJ-1038', route: 'Bremen → Bratislava', carrier: 'EastBound Kft.', status: 'delivered', eta: 'Delivered' },
]

const statusConfig = {
  in_transit: { label: 'In Transit', bg: 'bg-blue-100 text-blue-700' },
  loading: { label: 'Loading', bg: 'bg-yellow-100 text-yellow-700' },
  delivered: { label: 'Delivered', bg: 'bg-green-100 text-green-700' },
  pending_pickup: { label: 'Pickup', bg: 'bg-gray-100 text-gray-600' },
}

const MyShipmentsWidget: React.FC<DashboardWidgetComponentProps<MyShipmentsSettings>> = ({ mode }) => {
  if (mode === 'settings') {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">No configuration options for this widget.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y">
      {DUMMY_SHIPMENTS.map((shipment) => {
        const cfg = statusConfig[shipment.status]
        return (
          <li key={shipment.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="mt-0.5 flex-shrink-0 rounded p-1 bg-muted">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{shipment.projectNo}</span>
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cfg.bg}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{shipment.route}</span>
                </div>
                <span className="text-xs text-muted-foreground">{shipment.carrier}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{shipment.eta}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default MyShipmentsWidget
