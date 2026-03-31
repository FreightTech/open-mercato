import './commands'

export const metadata = {
  name: 'fms_invoicing',
  title: 'Invoicing',
  version: '0.1.0',
  description: 'FMS invoicing module for managing invoices, approvals, and PDF generation',
  author: 'Development Team',
  license: 'Proprietary',
  requires: ['fms_documents', 'attachments'],
}

export { features } from './acl'
