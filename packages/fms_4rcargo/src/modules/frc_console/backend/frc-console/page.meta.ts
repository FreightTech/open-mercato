import React from 'react'
import { Container } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_console.view'],
  pageTitle: 'Console',
  pageTitleKey: 'frc_console.nav.console',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 55,
  icon: React.createElement(Container, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Console', labelKey: 'frc_console.nav.console' },
  ],
}
