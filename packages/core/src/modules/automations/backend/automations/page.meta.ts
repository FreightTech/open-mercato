import React from 'react'

const automationsIcon = React.createElement(
  'svg',
  { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
  React.createElement('path', { d: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.view'],
  pageTitle: 'Automations',
  pageTitleKey: 'automations.definitions.title',
  pageGroup: 'Automations',
  pageGroupKey: 'automations.title',
  pagePriority: 10,
  pageOrder: 95,
  icon: automationsIcon,
  breadcrumb: [{ label: 'Automations', labelKey: 'automations.title' }],
}
