"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import type { RfqInboxSettings } from './config'
import { Clock, MapPin } from 'lucide-react'

type RfqItem = {
  id: string
  rfqNo: string
  client: string
  route: string
  loadDate: string
  mode: string
  weight: string
  receivedAgo: string
  urgency: 'urgent' | 'normal' | 'low'
  offersCount: number
}

const DUMMY_RFQS: RfqItem[] = [
  { id: '1', rfqNo: 'RFQ-2401', client: 'ACME Logistics', route: 'Hamburg → Warsaw', loadDate: '2024-12-18', mode: 'FTL', weight: '22t', receivedAgo: '15m ago', urgency: 'urgent', offersCount: 0 },
  { id: '2', rfqNo: 'RFQ-2399', client: 'NordChem AG', route: 'Rotterdam → Prague', loadDate: '2024-12-19', mode: 'FTL', weight: '18t', receivedAgo: '1h ago', urgency: 'urgent', offersCount: 1 },
  { id: '3', rfqNo: 'RFQ-2397', client: 'Baltic Steel', route: 'Gdansk → Berlin', loadDate: '2024-12-20', mode: 'LTL', weight: '8t', receivedAgo: '2h ago', urgency: 'normal', offersCount: 2 },
  { id: '4', rfqNo: 'RFQ-2394', client: 'EuroFresh GmbH', route: 'Antwerp → Vienna', loadDate: '2024-12-20', mode: 'Reefer', weight: '14t', receivedAgo: '3h ago', urgency: 'normal', offersCount: 0 },
  { id: '5', rfqNo: 'RFQ-2391', client: 'Central Parts Ltd', route: 'Bremen → Bratislava', loadDate: '2024-12-22', mode: 'FTL', weight: '24t', receivedAgo: '5h ago', urgency: 'low', offersCount: 3 },
  { id: '6', rfqNo: 'RFQ-2388', client: 'MediSupply Sp. z o.o.', route: 'Szczecin → Munich', loadDate: '2024-12-23', mode: 'LTL', weight: '6t', receivedAgo: '8h ago', urgency: 'low', offersCount: 1 },
]

const urgencyConfig = {
  urgent: { label: 'Urgent', bg: 'bg-red-100 text-red-700' },
  normal: { label: 'New', bg: 'bg-blue-100 text-blue-700' },
  low: { label: 'Open', bg: 'bg-gray-100 text-gray-600' },
}

const RfqInboxWidget: React.FC<DashboardWidgetComponentProps<RfqInboxSettings>> = ({ mode }) => {
  if (mode === 'settings') {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">No configuration options for this widget.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-2 pr-3 text-left font-medium">RFQ</th>
              <th className="pb-2 pr-3 text-left font-medium">Client</th>
              <th className="pb-2 pr-3 text-left font-medium">Route</th>
              <th className="pb-2 pr-3 text-left font-medium">Load Date</th>
              <th className="pb-2 pr-3 text-left font-medium">Mode</th>
              <th className="pb-2 pr-3 text-right font-medium">Offers</th>
              <th className="pb-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {DUMMY_RFQS.map((rfq) => {
              const urg = urgencyConfig[rfq.urgency]
              return (
                <tr key={rfq.id} className="hover:bg-muted/50">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{rfq.rfqNo}</span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{rfq.client}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span>{rfq.route}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{rfq.loadDate}</td>
                  <td className="py-2 pr-3">
                    <span className="text-xs">{rfq.mode} &middot; {rfq.weight}</span>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <span className={rfq.offersCount === 0 ? 'text-muted-foreground' : 'font-medium'}>
                      {rfq.offersCount}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${urg.bg}`}>
                        {urg.label}
                      </span>
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {rfq.receivedAgo}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default RfqInboxWidget
