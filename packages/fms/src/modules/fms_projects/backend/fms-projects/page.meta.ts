import React from 'react'

const projectIcon = React.createElement(
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
  React.createElement('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' }),
  React.createElement('line', { x1: '9', y1: '3', x2: '9', y2: '21' }),
  React.createElement('line', { x1: '15', y1: '9', x2: '21', y2: '9' }),
  React.createElement('line', { x1: '15', y1: '15', x2: '21', y2: '15' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_projects.projects.view'],
  pageTitle: 'Files',
  pageTitleKey: 'fms_projects.nav.files',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_offers.nav.group',
  pageOrder: 104, // FMS: 3. Files
  icon: projectIcon,
  breadcrumb: [{ label: 'Files', labelKey: 'fms_projects.nav.files' }],
}
