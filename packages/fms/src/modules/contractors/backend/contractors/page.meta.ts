import React from 'react'
import { Users } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['contractors.view'],
  pageTitle: 'Contractors',
  pageTitleKey: 'contractors.list.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 108, // FMS: 5. Contractors
  icon: React.createElement(Users, { size: 16 }),
  breadcrumb: [{ label: 'Contractors', labelKey: 'contractors.list.title' }],
}
