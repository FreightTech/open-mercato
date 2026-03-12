import React from 'react'

const templateIcon = React.createElement(
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
  // File icon with lines (representing template)
  React.createElement('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
  React.createElement('polyline', { points: '14 2 14 8 20 8' }),
  React.createElement('line', { x1: '16', y1: '13', x2: '8', y2: '13' }),
  React.createElement('line', { x1: '16', y1: '17', x2: '8', y2: '17' }),
  React.createElement('line', { x1: '10', y1: '9', x2: '8', y2: '9' })
)

export const metadata = {
  requireAuth: true,
  // User needs at least one of these features to access the unified page
  requireFeatures: ['email_templates.settings.manage'],
  pageTitle: 'Template Settings',
  pageTitleKey: 'templates.config.nav.title',
  pageGroup: 'Configuration',
  pageGroupKey: 'backend.nav.configuration',
  pageContext: 'settings' as const,
  pageOrder: 445, // Before email (450) and pdf (460)
  icon: templateIcon,
  breadcrumb: [
    { label: 'Template Settings', labelKey: 'templates.config.nav.title' },
  ],
} as const

export default metadata
