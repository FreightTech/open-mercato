import React from 'react'

const pendingIcon = React.createElement(
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
  React.createElement('circle', { cx: 12, cy: 12, r: 10 }),
  React.createElement('polyline', { points: '12 6 12 12 16 14' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_quotes.offers.view'],
  pageTitle: 'Pending Offers',
  pageTitleKey: 'fms_quotes.nav.offers_pending',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pagePriority: 50,
  pageOrder: 106, // After Freight Offers (105)
  icon: pendingIcon,
  breadcrumb: [
    { label: 'Freight Offers', labelKey: 'fms_quotes.nav.offers', href: '/fms-offers' },
    { label: 'Pending', labelKey: 'fms_quotes.nav.offers_pending' },
  ],
}
