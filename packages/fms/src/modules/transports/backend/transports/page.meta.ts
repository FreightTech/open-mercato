import React from 'react'
import { Package } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['transports.transports.view'],
  pageTitle: 'Transports',
  pageTitleKey: 'transports.list.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 106, // FMS: 4. Transports
  icon: React.createElement(Package, { size: 16 }),
  breadcrumb: [{ label: 'Transports', labelKey: 'transports.list.title' }],
}
