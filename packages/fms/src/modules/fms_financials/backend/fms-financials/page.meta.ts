import React from 'react'

const financialsIcon = React.createElement(
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
  React.createElement('line', { x1: '12', y1: '1', x2: '12', y2: '23' }),
  React.createElement('path', { d: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_financials.dashboard.view'],
  pageTitle: 'Financials',
  pageTitleKey: 'fms_financials.nav.dashboard',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 112, // FMS: 7. Financials
  icon: financialsIcon,
  breadcrumb: [{ label: 'Financials', labelKey: 'fms_financials.nav.dashboard' }],
}
