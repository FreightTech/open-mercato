export const metadata = {
  requireAuth: true,
  requireFeatures: ['tables.view'],
  pageTitle: 'Table Viewer',
  pageTitleKey: 'tables.viewer.title',
  navHidden: true,
  breadcrumb: [
    { label: 'Tables', labelKey: 'tables.nav.tables', href: '/backend/tables' },
    { label: 'View', labelKey: 'tables.viewer.title' },
  ],
}
