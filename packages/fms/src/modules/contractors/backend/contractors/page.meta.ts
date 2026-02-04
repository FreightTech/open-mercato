import React from 'react'
import { Building2 } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['contractors.view'],
  pageTitle: 'Contractors',
  pageTitleKey: 'contractors.list.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 110, // FMS: 6. Contractors
  icon: React.createElement(Building2, { size: 16 }),
  breadcrumb: [{ label: 'Contractors', labelKey: 'contractors.list.title' }],
}
