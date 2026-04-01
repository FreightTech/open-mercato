export const metadata = {
  title: 'Invoice Detail',
  navHidden: true,
  requireAuth: true,
  requireFeatures: ['ksef.view'],
  pageGroup: 'KSeF',
  pageGroupKey: 'ksef.nav.group',
  breadcrumb: [
    { label: 'Invoices', labelKey: 'ksef.nav.invoices', href: '/backend/ksef/invoices' },
    { label: 'Detail' },
  ],
}
