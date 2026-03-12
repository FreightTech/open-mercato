// Register commands when module loads
import './commands'

export const metadata = {
  name: 'fms_offers',
  title: 'FMS Offers',
  version: '0.2.0',
  description: 'Freight offers and RFQ management for the FMS module',
  author: 'Development Team',
  license: 'Proprietary',
  requires: [],
}

export { features } from './acl'
