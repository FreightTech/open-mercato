import React from 'react'

const pricingIcon = React.createElement(
  'svg',
  { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
  React.createElement('circle', { cx: 12, cy: 12, r: 10 }),
  React.createElement('path', { d: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8' }),
  React.createElement('path', { d: 'M12 18V6' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_settings.manage'],
  pageTitle: 'Pricing Settings',
  pageTitleKey: 'frc_settings.pricing.title',
  pageGroup: 'Configuration',
  pageGroupKey: 'backend.nav.configuration',
  pageContext: 'settings' as const,
  pageOrder: 465,
  icon: pricingIcon,
  breadcrumb: [
    { label: 'Pricing Settings', labelKey: 'frc_settings.pricing.title' },
  ],
} as const
