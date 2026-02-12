import React from 'react'

// Table2 icon (Lucide)
const icon = React.createElement(
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
  React.createElement('path', { d: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['tables.view'],
  pageTitle: 'Tables',
  pageTitleKey: 'tables.nav.tables',
  pageGroup: 'Tables',
  pageGroupKey: 'tables.nav.group',
  pagePriority: 65,
  pageOrder: 10,
  icon,
  breadcrumb: [{ label: 'Tables', labelKey: 'tables.nav.tables' }],
}
