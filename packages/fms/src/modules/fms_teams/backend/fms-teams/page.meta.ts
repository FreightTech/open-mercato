import React from 'react'
import { Users } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_teams.view'],
  pageTitle: 'Teams',
  pageTitleKey: 'fms_teams.list.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 109, // FMS: 6. Teams (after Contractors)
  icon: React.createElement(Users, { size: 16 }),
  breadcrumb: [{ label: 'Teams', labelKey: 'fms_teams.list.title' }],
}
