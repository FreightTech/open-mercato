import type { ResponseEnricher, EnricherContext } from '@open-mercato/shared/lib/crud/response-enricher'
import type { EntityManager } from '@mikro-orm/postgresql'
import { KsefSubmission } from './entities'

type EntityRecord = Record<string, unknown> & { id: string }

interface KsefEnrichment {
  _ksef: {
    status: string
    ksefNumber: string | null
    referenceNumber: string | null
    submittedAt: string | null
    acceptedAt: string | null
    errorMessage: string | null
    errorCode: string | null
    offlineMode: string | null
  } | null
}

type EnricherScope = EnricherContext & { em: EntityManager }

function formatSubmission(submission: KsefSubmission): KsefEnrichment['_ksef'] {
  return {
    status: submission.status,
    ksefNumber: submission.ksefNumber ?? null,
    referenceNumber: submission.ksefReferenceNumber ?? null,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    acceptedAt: submission.acceptedAt?.toISOString() ?? null,
    errorMessage: submission.errorMessage ?? null,
    errorCode: submission.errorCode ?? null,
    offlineMode: submission.offlineMode ?? null,
  }
}

const ksefSubmissionEnricher: ResponseEnricher<EntityRecord, KsefEnrichment> = {
  id: 'ksef.submission-status',
  targetEntity: 'fms_invoicing:fms_invoicing_invoice',
  features: ['ksef.view'],
  priority: 50,
  timeout: 1000,
  critical: false,
  fallback: { _ksef: null },

  async enrichOne(record, context: EnricherScope) {
    const em = context.em.fork()

    const submission = await em.findOne(KsefSubmission, {
      invoiceId: record.id,
      organizationId: context.organizationId,
      tenantId: context.tenantId,
    })

    return {
      ...record,
      _ksef: submission ? formatSubmission(submission) : null,
    }
  },

  async enrichMany(records, context: EnricherScope) {
    if (records.length === 0) return records.map((r) => ({ ...r, _ksef: null }))

    const em = context.em.fork()
    const recordIds = records.map((r) => r.id)

    const submissions = await em.find(KsefSubmission, {
      invoiceId: { $in: recordIds },
      organizationId: context.organizationId,
      tenantId: context.tenantId,
    })

    if (submissions.length === 0) return records.map((r) => ({ ...r, _ksef: null }))

    const submissionsByInvoice = new Map<string, KsefSubmission>()
    for (const submission of submissions) {
      submissionsByInvoice.set(submission.invoiceId, submission)
    }

    return records.map((record) => {
      const submission = submissionsByInvoice.get(record.id)
      return {
        ...record,
        _ksef: submission ? formatSubmission(submission) : null,
      }
    })
  },
}

export const enrichers: ResponseEnricher[] = [ksefSubmissionEnricher]
