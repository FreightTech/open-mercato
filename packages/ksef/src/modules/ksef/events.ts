import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  // Submission lifecycle
  { id: 'ksef.submission.queued', label: 'KSeF Submission Queued', entity: 'ksef_submission', category: 'lifecycle' },
  { id: 'ksef.submission.submitted', label: 'KSeF Invoice Submitted', entity: 'ksef_submission', category: 'lifecycle' },
  { id: 'ksef.submission.accepted', label: 'KSeF Invoice Accepted', entity: 'ksef_submission', category: 'lifecycle' },
  { id: 'ksef.submission.rejected', label: 'KSeF Invoice Rejected', entity: 'ksef_submission', category: 'lifecycle' },
  { id: 'ksef.submission.error', label: 'KSeF Submission Error', entity: 'ksef_submission', category: 'lifecycle' },
  { id: 'ksef.submission.upo_downloaded', label: 'KSeF UPO Downloaded', entity: 'ksef_submission', category: 'lifecycle' },

  // Received invoices
  { id: 'ksef.invoice.received', label: 'KSeF Invoice Received', entity: 'ksef_submission', category: 'lifecycle' },

  // Session lifecycle
  { id: 'ksef.session.opened', label: 'KSeF Session Opened', entity: 'ksef_session', category: 'lifecycle' },
  { id: 'ksef.session.closed', label: 'KSeF Session Closed', entity: 'ksef_session', category: 'lifecycle' },
  { id: 'ksef.session.error', label: 'KSeF Session Error', entity: 'ksef_session', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'ksef',
  events,
})

export const emitKsefEvent = eventsConfig.emit

export type KsefEventId = (typeof events)[number]['id']

export interface KsefSubmissionEventPayload {
  id: string
  invoiceId: string
  tenantId: string
  organizationId: string
  status?: string
  ksefNumber?: string
  [key: string]: unknown
}

export interface KsefSessionEventPayload {
  id: string
  tenantId: string
  organizationId: string
  sessionType: string
  nip: string
  [key: string]: unknown
}

export default eventsConfig
