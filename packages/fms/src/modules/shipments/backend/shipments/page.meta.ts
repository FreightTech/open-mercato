import React from 'react'
import { Package } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['shipments.shipments.view'],
  pageTitle: 'Shipments',
  pageTitleKey: 'shipments.list.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pagePriority: 50,
  pageOrder: 120,
  icon: React.createElement(Package, { size: 16 }),
  breadcrumb: [{ label: 'Shipments', labelKey: 'shipments.list.title' }],
}
