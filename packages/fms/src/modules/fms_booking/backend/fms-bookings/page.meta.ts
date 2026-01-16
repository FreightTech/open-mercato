import React from 'react'

const bookingIcon = React.createElement(
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
  requireFeatures: ['fms_booking.bookings.view'],
  pageTitle: 'Freight Bookings',
  pageTitleKey: 'fms_booking.nav.bookings',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_quotes.nav.group',
  pagePriority: 45,
  pageOrder: 200,
  icon: bookingIcon,
  breadcrumb: [{ label: 'Freight Bookings', labelKey: 'fms_booking.nav.bookings' }],
}
