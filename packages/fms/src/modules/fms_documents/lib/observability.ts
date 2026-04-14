import { createLogger, getMeter } from '@open-mercato/logger'
import { withSpan } from '@open-mercato/logger/tracing'
import type { Span } from '@opentelemetry/api'

const MODULE_NAME = 'fms_documents'

export const documentsLogger = createLogger(MODULE_NAME)

type Counter = ReturnType<ReturnType<typeof getMeter>['createCounter']>
type Histogram = ReturnType<ReturnType<typeof getMeter>['createHistogram']>

let cachedExtractionCounter: Counter | null = null
let cachedExtractionDurationHistogram: Histogram | null = null
let cachedOcrHistogram: Histogram | null = null
let cachedDetectionHistogram: Histogram | null = null
let cachedConsensusHistogram: Histogram | null = null

function meter() {
  return getMeter(MODULE_NAME)
}

function extractionCounter(): Counter {
  if (!cachedExtractionCounter) {
    cachedExtractionCounter = meter().createCounter('fms.documents.extracted', {
      description: 'Number of documents extracted',
      unit: '1',
    })
  }
  return cachedExtractionCounter
}

function extractionDurationHistogram(): Histogram {
  if (!cachedExtractionDurationHistogram) {
    cachedExtractionDurationHistogram = meter().createHistogram('fms.documents.extraction.duration', {
      description: 'Document extraction total duration in milliseconds',
      unit: 'ms',
    })
  }
  return cachedExtractionDurationHistogram
}

function ocrHistogram(): Histogram {
  if (!cachedOcrHistogram) {
    cachedOcrHistogram = meter().createHistogram('fms.documents.ocr.duration_ms', {
      description: 'Document OCR stage duration in milliseconds',
      unit: 'ms',
    })
  }
  return cachedOcrHistogram
}

function detectionHistogram(): Histogram {
  if (!cachedDetectionHistogram) {
    cachedDetectionHistogram = meter().createHistogram('fms.documents.detection.duration_ms', {
      description: 'Document type detection stage duration in milliseconds',
      unit: 'ms',
    })
  }
  return cachedDetectionHistogram
}

function consensusHistogram(): Histogram {
  if (!cachedConsensusHistogram) {
    cachedConsensusHistogram = meter().createHistogram('fms.documents.consensus.duration_ms', {
      description: 'LLM extraction + consensus stage duration in milliseconds',
      unit: 'ms',
    })
  }
  return cachedConsensusHistogram
}

export type DocumentParseStatus = 'success' | 'failure' | 'skipped'
export type DocumentParseSource = 'worker' | 'api' | 'command'

export type DocumentParseBindings = {
  documentType: string
  category: string
  tenantId: string | null
  organizationId: string | null
  source: DocumentParseSource
}

function parseAttributes(b: DocumentParseBindings, status: DocumentParseStatus) {
  return {
    'fms.documents.document_type': b.documentType,
    'fms.documents.category': b.category,
    'fms.documents.tenant_id': b.tenantId ?? 'system',
    'fms.documents.organization_id': b.organizationId ?? 'system',
    'fms.documents.source': b.source,
    'fms.documents.status': status,
  }
}

export function recordDocumentParse(
  bindings: DocumentParseBindings,
  status: DocumentParseStatus,
  durationMs?: number,
): void {
  extractionCounter().add(1, parseAttributes(bindings, status))
  if (typeof durationMs === 'number') {
    extractionDurationHistogram().record(durationMs, parseAttributes(bindings, status))
  }
}

export function recordOcrDuration(documentType: string, durationMs: number): void {
  ocrHistogram().record(durationMs, { 'fms.documents.document_type': documentType })
}

export function recordDetectionDuration(documentType: string, durationMs: number): void {
  detectionHistogram().record(durationMs, { 'fms.documents.document_type': documentType })
}

export function recordConsensusDuration(documentType: string, durationMs: number): void {
  consensusHistogram().record(durationMs, { 'fms.documents.document_type': documentType })
}

export async function withDocumentParseSpan<T>(
  bindings: Pick<DocumentParseBindings, 'tenantId' | 'organizationId' | 'source'> & {
    documentId: string
  },
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan(
    {
      name: 'fms.documents.parse',
      attributes: {
        'fms.documents.document_id': bindings.documentId,
        'fms.documents.tenant_id': bindings.tenantId ?? 'system',
        'fms.documents.organization_id': bindings.organizationId ?? 'system',
        'fms.documents.source': bindings.source,
      },
    },
    fn,
  )
}
