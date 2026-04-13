import React from 'react'

const shipIcon = React.createElement(
  'svg',
  { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
  React.createElement('path', { d: 'M2 21l.5-2h19l.5 2' }),
  React.createElement('path', { d: 'M3.5 19l1-6h15l1 6' }),
  React.createElement('path', { d: 'M5.5 13l1.5-4h10l1.5 4' }),
  React.createElement('path', { d: 'M12 3v6' }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['customs.view'],
  pageTitle: 'Customs Clearance',
  pageTitleKey: 'customs.nav.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_offers.nav.group',
  pageOrder: 30000,
  icon: shipIcon,
}
