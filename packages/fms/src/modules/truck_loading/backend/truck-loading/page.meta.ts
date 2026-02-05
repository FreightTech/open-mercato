import React from 'react'

const truckLoadingIcon = React.createElement(
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
  React.createElement('path', { d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2' }),
  React.createElement('path', { d: 'M15 18H9' }),
  React.createElement('path', { d: 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14' }),
  React.createElement('circle', { cx: '17', cy: '18', r: '2' }),
  React.createElement('circle', { cx: '7', cy: '18', r: '2' }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['truck_loading.view'],
  pageTitle: 'Truck Loading',
  pageTitleKey: 'truck_loading.nav.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pageOrder: 115,
  icon: truckLoadingIcon,
  breadcrumb: [{ label: 'Truck Loading', labelKey: 'truck_loading.nav.title' }],
}
