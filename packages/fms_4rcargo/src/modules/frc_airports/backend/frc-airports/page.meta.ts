import React from 'react'
import { PlaneTakeoff } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_airports.view'],
  pageTitle: 'Airports',
  pageTitleKey: 'frc_airports.nav.airports',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 40,
  icon: React.createElement(PlaneTakeoff, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Airports', labelKey: 'frc_airports.nav.airports' },
  ],
}
