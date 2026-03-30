import type { EntityExtension } from '@open-mercato/shared/modules/entities'

export const extensions: EntityExtension[] = [
  {
    base: 'fms_invoicing:fms_invoicing_invoice',
    extension: 'ksef:ksef_submission',
    join: { baseKey: 'id', extensionKey: 'invoice_id' },
  },
]

export default extensions
