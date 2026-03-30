export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_documents.invoices.manage'],
  pageTitle: 'Allocate Costs',
  pageTitleKey: 'fms_documents.nav.allocate_costs',
  hideFromNav: true,
  breadcrumb: [
    { label: 'Documents', labelKey: 'fms_documents.nav.documents', href: '/backend/fms-documents' },
    { label: 'Allocate Costs', labelKey: 'fms_documents.nav.allocate_costs' },
  ],
}
