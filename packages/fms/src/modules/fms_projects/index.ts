/**
 * FMS Files Module
 * Shipping file management with workflow orchestration
 * Note: "File" is industry terminology for active shipments (Polish: "Teczka")
 */

export const metadata = {
  name: 'fms_files',
  title: 'FMS Files',
  version: '1.0.0',
  description: 'Shipping file management with workflow orchestration',
  author: 'Development Team',
  license: 'Proprietary',
  requires: ['fms_quotes', 'fms_documents', 'workflows'],
}

export { features } from './acl'
export { default as cli } from './cli'
