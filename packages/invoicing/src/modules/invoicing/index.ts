import './commands'

export const metadata = {
  name: 'invoicing',
  title: 'Invoicing',
  version: '0.1.0',
  description: 'Centralized invoicing module with KSeF (Polish National e-Invoice System) integration',
  author: 'Development Team',
  license: 'Proprietary',
  requires: ['fms_documents', 'attachments'],
}

export { features } from './acl'
