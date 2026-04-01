export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_invoicing.invoices.manage'],
  pageTitle: 'New Invoice',
  pageTitleKey: 'invoicing.builder.create',
  navHidden: true,
  pageGroup: 'FMS',
  pageGroupKey: 'fms_offers.nav.group',
  breadcrumb: [
    { label: 'Invoicing', labelKey: 'invoicing.nav.invoicing', href: '/backend/fms-invoicing' },
    { label: 'New Invoice', labelKey: 'invoicing.builder.create' },
  ],
}
