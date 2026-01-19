/**
 * FMS Projects Module
 * Shipping project management with workflow orchestration
 * Renamed from "Files" - "Project" better represents a shipment operation
 */

// Register commands when module loads
import './commands'

export const metadata = {
  name: 'fms_projects',
  title: 'FMS Projects',
  version: '1.0.0',
  description: 'Shipping project management with workflow orchestration',
  author: 'Development Team',
  license: 'Proprietary',
  requires: ['fms_quotes', 'fms_documents', 'workflows'],
}

export { features } from './acl'
export { default as cli } from './cli'
