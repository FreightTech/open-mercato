import React from 'react'
import { Settings } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['shipment_tracking.carrier_configs.view'],
  pageTitle: 'Carrier Configs',
  pageTitleKey: 'shipment_tracking.nav.carrier_configs',
  pageGroup: 'Shipment Tracking',
  pageGroupKey: 'shipment_tracking.nav.group',
  pagePriority: 10,
  pageOrder: 120,
  icon: React.createElement(Settings, { size: 16 }),
  breadcrumb: [{ label: 'Carrier Configs', labelKey: 'shipment_tracking.nav.carrier_configs' }],
}
