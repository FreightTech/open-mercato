/**
 * FMS Booking Module
 * Shipping booking management with workflow orchestration
 */

export const metadata = {
  name: 'fms_booking',
  title: 'FMS Booking',
  version: '1.0.0',
  description: 'Shipping booking management with workflow orchestration',
  author: 'Development Team',
  license: 'Proprietary',
  requires: ['fms_quotes', 'fms_documents', 'workflows'],
}

export { features } from './acl'
export { default as cli } from './cli'
