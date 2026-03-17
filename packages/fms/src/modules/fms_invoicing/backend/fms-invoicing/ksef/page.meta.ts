import React from 'react'

const ksefIcon = React.createElement(
  'svg',
  {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }),
  React.createElement('path', { d: 'm9 12 2 2 4-4' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_invoicing.ksef.view'],
  pageTitle: 'KSeF Dashboard',
  pageTitleKey: 'fms_invoicing.nav.ksef',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_offers.nav.group',
  pageOrder: 126,
  icon: ksefIcon,
  breadcrumb: [
    { label: 'Invoicing', labelKey: 'fms_invoicing.nav.invoicing', href: '/backend/fms-invoicing' },
    { label: 'KSeF', labelKey: 'fms_invoicing.nav.ksef' },
  ],
}
