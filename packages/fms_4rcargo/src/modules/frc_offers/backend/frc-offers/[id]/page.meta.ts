export const metadata = {
  requireAuth: true,
  requireFeatures: ['frc_offers.view'],
  pageTitle: 'Offer Details',
  pageTitleKey: 'frc_offers.nav.details',
  hideFromNav: true,
  breadcrumb: [
    { label: '4R Cargo', labelKey: 'frc.nav.group' },
    { label: 'Offers', labelKey: 'frc_offers.nav.offers', href: '/backend/frc-offers' },
    { label: 'Details', labelKey: 'common.details' },
  ],
}
