export const metadata = {
  requireAuth: true,
  requireFeatures: ['invoicing.invoices.manage'],
  pageTitle: 'Edit Invoice',
  pageTitleKey: 'invoicing.builder.edit',
  hidden: true,
  breadcrumb: [
    { label: 'Invoicing', labelKey: 'invoicing.nav.invoicing', href: '/backend/invoicing' },
    { label: 'Edit Invoice', labelKey: 'invoicing.builder.edit' },
  ],
}
