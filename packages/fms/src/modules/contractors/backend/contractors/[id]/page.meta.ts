export const metadata = {
  requireAuth: true,
  requireFeatures: ['contractors.view'],
  pageTitle: 'Contractor Details',
  pageTitleKey: 'contractors.nav.details',
  hideFromNav: true,
  breadcrumb: [
    { label: 'Contractors', labelKey: 'contractors.list.title', href: '/backend/contractors' },
    { label: 'Details', labelKey: 'common.details' },
  ],
}
