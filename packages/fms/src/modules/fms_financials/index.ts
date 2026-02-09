// Register commands when module is imported
import './commands'

export const metadata = {
  name: 'fms_financials',
  title: 'FMS Financials',
  version: '0.2.0',
  description: 'Invoice processing with AI-powered OCR extraction and charge code matching',
  author: 'Development Team',
  license: 'Proprietary',
  requires: ['fms_projects', 'fms_offers', 'fms_products', 'attachments'],
}

export { features } from './acl'
