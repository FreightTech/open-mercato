export const metadata = {
  title: 'Create Invoice',
  navHidden: true,
  requireAuth: true,
  requireFeatures: ['ksef.submit'],
  pageGroup: 'KSeF',
  pageGroupKey: 'ksef.nav.group',
  breadcrumb: [
    { label: 'Invoices', labelKey: 'ksef.nav.invoices', href: '/backend/ksef/invoices' },
    { label: 'Create' },
  ],
}
