import React from 'react'

const integrationsIcon = React.createElement(
  'svg',
  { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
  React.createElement('path', { d: 'M12 22v-5' }),
  React.createElement('path', { d: 'M9 8V2' }),
  React.createElement('path', { d: 'M15 8V2' }),
  React.createElement('path', { d: 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z' }),
  React.createElement('path', { d: 'M12 17v5' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_settings.view'],
  pageTitle: 'Integrations',
  pageTitleKey: 'frc_settings.integrations.title',
  pageGroup: 'Configuration',
  pageGroupKey: 'backend.nav.configuration',
  pageContext: 'settings' as const,
  pageOrder: 460,
  icon: integrationsIcon,
  breadcrumb: [
    { label: 'Integrations', labelKey: 'frc_settings.integrations.title' },
  ],
} as const
