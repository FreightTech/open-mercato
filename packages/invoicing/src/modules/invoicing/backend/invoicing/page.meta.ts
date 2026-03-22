import React from 'react'

const invoiceIcon = React.createElement(
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
  React.createElement('path', { d: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z' }),
  React.createElement('path', { d: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8' }),
  React.createElement('path', { d: 'M12 17.5v.5' }),
  React.createElement('path', { d: 'M12 6v.5' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['invoicing.invoices.view'],
  pageTitle: 'Invoicing',
  pageTitleKey: 'invoicing.nav.invoicing',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_offers.nav.group',
  pageOrder: 125,
  icon: invoiceIcon,
  breadcrumb: [{ label: 'Invoicing', labelKey: 'invoicing.nav.invoicing' }],
}
