import React from 'react'
import { FileCheck } from 'lucide-react'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_quotes.view'],
  pageTitle: 'Quotes',
  pageTitleKey: 'frc_quotes.nav.quotes',
  pageGroup: '4R Cargo',
  pageGroupKey: 'frc.nav.group',
  pageOrder: 20,
  icon: React.createElement(FileCheck, { size: 16 }),
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Quotes', labelKey: 'frc_quotes.nav.quotes' },
  ],
}
