import React from 'react'
import { Package } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['air_cargo.view'],
  pageTitle: 'Air Cargo',
  pageTitleKey: 'air_cargo.nav.airCargo',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 25,
  icon: React.createElement(Package, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Air Cargo', labelKey: 'air_cargo.nav.airCargo' },
  ],
}
