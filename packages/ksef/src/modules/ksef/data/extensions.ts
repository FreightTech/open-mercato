import type { EntityExtension } from '@open-mercato/shared/modules/entities'

export const extensions: EntityExtension[] = [
  // KsefInvoice ↔ KsefSubmission (own module, always active)
  {
    base: 'ksef:ksef_invoice',
    extension: 'ksef:ksef_submission',
    join: { baseKey: 'id', extensionKey: 'ksef_invoice_id' },
  },
  // Bridge: FMS invoice ↔ KsefSubmission (only active when fms_invoicing is installed)
  {
    base: 'fms_invoicing:fms_invoicing_invoice',
    extension: 'ksef:ksef_submission',
    join: { baseKey: 'id', extensionKey: 'invoice_id' },
  },
]

export default extensions
