import React from 'react'
import { FileCheck } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_offers.view'],
  pageTitle: 'Offers',
  pageTitleKey: 'frc_offers.nav.offers',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 20,
  icon: React.createElement(FileCheck, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Offers', labelKey: 'frc_offers.nav.offers' },
  ],
}
