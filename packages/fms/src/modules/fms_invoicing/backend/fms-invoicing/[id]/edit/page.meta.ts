export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_invoicing.invoices.manage'],
  pageTitle: 'Edit Invoice',
  pageTitleKey: 'invoicing.builder.edit',
  hidden: true,
  breadcrumb: [
    { label: 'Invoicing', labelKey: 'invoicing.nav.invoicing', href: '/backend/fms-invoicing' },
    { label: 'Edit Invoice', labelKey: 'invoicing.builder.edit' },
  ],
}
