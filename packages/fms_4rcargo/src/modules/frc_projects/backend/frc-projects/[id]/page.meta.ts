export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_projects.view'],
  pageTitle: 'Project Details',
  pageTitleKey: 'frc_projects.nav.details',
  hideFromNav: true,
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Projects', labelKey: 'frc_projects.nav.projects', href: '/backend/frc-projects' },
    { label: 'Details', labelKey: 'common.details' },
  ],
}
