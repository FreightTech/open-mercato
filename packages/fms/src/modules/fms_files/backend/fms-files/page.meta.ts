import React from 'react'

const fileIcon = React.createElement(
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
  React.createElement('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_files.files.view'],
  pageTitle: 'Files (New)',
  pageTitleKey: 'fms_files.nav.files',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_offers.nav.group',
  pageOrder: 105,
  icon: fileIcon,
  breadcrumb: [{ label: 'Files (New)', labelKey: 'fms_files.nav.files' }],
}
