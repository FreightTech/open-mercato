export const features = [
  // Document features
  {
    id: 'fms_documents.view',
    title: 'View FMS documents',
    module: 'fms_documents',
  },
  {
    id: 'fms_documents.manage',
    title: 'Manage FMS documents',
    module: 'fms_documents',
  },
  {
    id: 'fms_documents.upload',
    title: 'Upload FMS documents',
    module: 'fms_documents',
  },
  {
    id: 'fms_documents.delete',
    title: 'Delete FMS documents',
    module: 'fms_documents',
  },
  // Invoice features (moved from fms_financials)
  { id: 'fms_documents.dashboard.view', title: 'View financial dashboard', module: 'fms_documents' },
  { id: 'fms_documents.reports.view', title: 'View financial reports', module: 'fms_documents' },
  { id: 'fms_documents.invoices.view', title: 'View invoices', module: 'fms_documents' },
  { id: 'fms_documents.invoices.upload', title: 'Upload invoices', module: 'fms_documents' },
  { id: 'fms_documents.invoices.manage', title: 'Manage invoices', module: 'fms_documents' },
  { id: 'fms_documents.invoices.approve', title: 'Approve/reject invoices', module: 'fms_documents' },
  { id: 'fms_documents.invoices.delete', title: 'Delete invoices', module: 'fms_documents' },
]

export default features
