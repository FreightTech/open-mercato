import React from 'react'
import { Container } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_console.view'],
  pageTitle: 'Console Detail',
  pageTitleKey: 'frc_console.nav.detail',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  hideFromNav: true,
  icon: React.createElement(Container, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Console', labelKey: 'frc_console.nav.console', href: '/backend/frc-console' },
    { label: 'Detail', labelKey: 'frc_console.nav.detail' },
  ],
}
