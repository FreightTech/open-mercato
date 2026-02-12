export const metadata = {
  requireAuth: true,
  requireFeatures: ['tables.manage'],
  pageTitle: 'Create Table',
  pageTitleKey: 'tables.create.title',
  navHidden: true,
  breadcrumb: [
    { label: 'Tables', labelKey: 'tables.nav.tables', href: '/backend/tables' },
    { label: 'Create', labelKey: 'tables.create.title' },
  ],
}
