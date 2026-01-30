import React from 'react'

const carrierIcon = React.createElement(
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
  React.createElement('path', { d: 'M2 21a8 8 0 0 1 13.292-6' }),
  React.createElement('circle', { cx: 12, cy: 8, r: 5 }),
  React.createElement('path', { d: 'M19 16v6' }),
  React.createElement('path', { d: 'M22 19h-6' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_products.carriers.view'],
  pageTitle: 'Carriers',
  pageTitleKey: 'fms_products.nav.carriers',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 203, // FMS: Carriers
  icon: carrierIcon,
  breadcrumb: [{ label: 'Carriers', labelKey: 'fms_products.nav.carriers' }],
}
