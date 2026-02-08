import React from 'react'
import { Building2 } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['shipment_tracking.companies.view'],
  pageTitle: 'Companies',
  pageTitleKey: 'shipment_tracking.nav.companies',
  pageGroup: 'Shipment Tracking',
  pageGroupKey: 'shipment_tracking.nav.group',
  pagePriority: 10,
  pageOrder: 100,
  icon: React.createElement(Building2, { size: 16 }),
  breadcrumb: [{ label: 'Companies', labelKey: 'shipment_tracking.nav.companies' }],
}
