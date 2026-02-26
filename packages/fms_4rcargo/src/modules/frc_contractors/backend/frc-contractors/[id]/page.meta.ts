export const metadata = {
  requireAuth: true,
  requireFeatures: ['contractors.view'],
  pageTitle: 'Contractor Details',
  pageTitleKey: 'frc_contractors.nav.details',
  hideFromNav: true,
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Contractors', labelKey: 'frc_contractors.nav.contractors', href: '/backend/frc-contractors' },
    { label: 'Details', labelKey: 'common.details' },
  ],
}
