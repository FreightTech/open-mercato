export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_projects.projects.view'],
  pageTitle: 'File Details',
  pageTitleKey: 'fms_projects.nav.details',
  hideFromNav: true,
  breadcrumb: [
    { label: 'Files', labelKey: 'fms_projects.nav.files', href: '/backend/fms-projects' },
    { label: 'Details', labelKey: 'common.details' },
  ],
}
