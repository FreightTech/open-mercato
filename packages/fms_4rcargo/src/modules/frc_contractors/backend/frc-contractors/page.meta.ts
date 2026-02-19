import React from 'react'
import { Building2 } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['contractors.view'],
  pageTitle: 'Contractors',
  pageTitleKey: 'frc_contractors.nav.contractors',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 60,
  icon: React.createElement(Building2, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Contractors', labelKey: 'frc_contractors.nav.contractors' },
  ],
}
