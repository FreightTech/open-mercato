import React from 'react'
import { Package } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['shipments.shipments.view'],
  pageTitle: 'Shipments',
  pageTitleKey: 'shipments.list.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 106, // FMS: 4. Shipments
  icon: React.createElement(Package, { size: 16 }),
  breadcrumb: [{ label: 'Shipments', labelKey: 'shipments.list.title' }],
}
