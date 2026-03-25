export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_files.files.view'],
  pageTitle: 'File Details',
  pageTitleKey: 'fms_files.nav.details',
  hideFromNav: true,
  breadcrumb: [
    { label: 'Files (New)', labelKey: 'fms_files.nav.files', href: '/backend/fms-files' },
    { label: 'Details', labelKey: 'common.details' },
  ],
}
