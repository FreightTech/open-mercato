import React from 'react'

const icon = React.createElement(
  'svg',
  { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
  React.createElement('path', { d: 'M22 12h-4l-3 9L9 3l-3 9H2' }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['invoicing.ksef.view'],
  pageTitle: 'KSeF Sessions',
  pageTitleKey: 'invoicing.settings.sessions',
  pageGroup: 'Invoicing',
  pageGroupKey: 'invoicing.module.title',
  pageOrder: 3,
  icon,
  pageContext: 'settings' as const,
}
