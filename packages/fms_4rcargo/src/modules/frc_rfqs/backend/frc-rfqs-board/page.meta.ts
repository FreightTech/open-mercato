import React from 'react'
import { Columns3 } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_rfqs.view'],
  pageTitle: 'Task Board',
  pageTitleKey: 'frc_rfqs.board.title',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 15,
  icon: React.createElement(Columns3, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Task Board', labelKey: 'frc_rfqs.board.title' },
  ],
}
