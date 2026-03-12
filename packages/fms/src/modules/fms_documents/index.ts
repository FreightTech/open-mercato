// Register commands when module is imported
import './commands'

export const metadata = {
  name: 'fms_documents',
  title: 'FMS Documents',
  version: '0.2.0',
  description: 'Unified document management with AI-powered OCR extraction, invoice processing, and charge code matching',
  author: 'Development Team',
  license: 'Proprietary',
  requires: ['attachments', 'fms_products'],
}

export { features } from './acl'
