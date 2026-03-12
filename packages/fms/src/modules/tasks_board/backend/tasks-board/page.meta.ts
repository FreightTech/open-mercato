import React from 'react'

const kanbanIcon = React.createElement(
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
  React.createElement('rect', { x: '3', y: '3', width: '5', height: '18', rx: '1' }),
  React.createElement('rect', { x: '10', y: '3', width: '5', height: '12', rx: '1' }),
  React.createElement('rect', { x: '17', y: '3', width: '5', height: '15', rx: '1' }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['tasks_board.view'],
  pageTitle: 'Task Board',
  pageTitleKey: 'tasks_board.nav.title',
  pageGroup: 'FMS',
  pageGroupKey: 'fms_offers.nav.group',
  pageOrder: 99, // FMS: first item
  icon: kanbanIcon,
  breadcrumb: [{ label: 'Task Board', labelKey: 'tasks_board.nav.title' }],
}
