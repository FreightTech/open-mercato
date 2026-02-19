import React from 'react'
import { FileText } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_rfqs.view'],
  pageTitle: 'Opportunities',
  pageTitleKey: 'frc_rfqs.nav.rfqs',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 10,
  icon: React.createElement(FileText, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'RFQs', labelKey: 'frc_rfqs.nav.rfqs' },
  ],
}
