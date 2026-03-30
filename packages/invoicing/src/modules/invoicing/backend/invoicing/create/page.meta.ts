export const metadata = {
  requireAuth: true,
  requireFeatures: ['invoicing.invoices.manage'],
  pageTitle: 'New Invoice',
  pageTitleKey: 'invoicing.builder.create',
  hidden: true,
  breadcrumb: [
    { label: 'Invoicing', labelKey: 'invoicing.nav.invoicing', href: '/backend/invoicing' },
    { label: 'New Invoice', labelKey: 'invoicing.builder.create' },
  ],
}
