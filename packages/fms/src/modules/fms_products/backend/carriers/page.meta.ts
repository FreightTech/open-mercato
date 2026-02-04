import React from 'react'
import { Ship } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_products.carriers.view'],
  pageTitle: 'Carriers',
  pageTitleKey: 'fms_products.nav.carriers',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 116, // FMS: 9. Carriers
  icon: React.createElement(Ship, { size: 16 }),
  breadcrumb: [{ label: 'Carriers', labelKey: 'fms_products.nav.carriers' }],
}
