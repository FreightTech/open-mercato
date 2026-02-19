import React from 'react'
import { Truck } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_trucks.view'],
  pageTitle: 'Trucks',
  pageTitleKey: 'frc_trucks.nav.trucks',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 50,
  icon: React.createElement(Truck, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Trucks', labelKey: 'frc_trucks.nav.trucks' },
  ],
}
