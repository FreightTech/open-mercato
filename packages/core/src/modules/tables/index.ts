import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'tables',
  title: 'Tables — SharePoint Excel Integration',
  version: '0.1.0',
  description: 'Browse SharePoint Excel files and view/edit data in DynamicTable with 2-way sync.',
  author: 'Open Mercato Team',
  license: 'Proprietary',
}

export { features } from './acl'
