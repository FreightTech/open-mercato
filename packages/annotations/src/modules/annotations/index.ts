import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'annotations',
  title: 'Annotations',
  version: '0.1.0',
  description: 'Cell-level annotations and comments for data tables',
  author: 'Open Mercato Team',
  license: 'Proprietary',
  ejectable: true,
}

export { features } from './acl'
