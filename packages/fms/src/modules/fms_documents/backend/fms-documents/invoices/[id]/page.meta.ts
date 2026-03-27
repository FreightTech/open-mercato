export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_documents.invoices.view'],
  pageTitle: 'Verify Invoice',
  pageTitleKey: 'fms_documents.nav.verify_invoice',
  hideFromNav: true,
  breadcrumb: [
    { label: 'Documents', labelKey: 'fms_documents.nav.documents', href: '/backend/fms-documents' },
    { label: 'Verify Invoice', labelKey: 'fms_documents.nav.verify_invoice' },
  ],
}
