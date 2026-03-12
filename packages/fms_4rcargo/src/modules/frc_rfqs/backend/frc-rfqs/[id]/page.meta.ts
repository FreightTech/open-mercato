export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_rfqs.view'],
  pageTitle: 'RFQ Details',
  pageTitleKey: 'frc_rfqs.nav.details',
  hideFromNav: true,
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'RFQs', labelKey: 'frc_rfqs.nav.rfqs', href: '/backend/frc-rfqs' },
    { label: 'Details', labelKey: 'common.details' },
  ],
}
