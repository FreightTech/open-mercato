export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_invoicing.invoices.manage'],
  pageTitle: 'Edit Invoice',
  pageTitleKey: 'invoicing.builder.edit',
  navHidden: true,
  pageGroup: 'FMS',
  pageGroupKey: 'fms_offers.nav.group',
  breadcrumb: [
    { label: 'Invoicing', labelKey: 'invoicing.nav.invoicing', href: '/backend/fms-invoicing' },
    { label: 'Edit Invoice', labelKey: 'invoicing.builder.edit' },
  ],
}
