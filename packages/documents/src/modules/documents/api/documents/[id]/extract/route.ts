/**
 * Documents - Document Extraction API
 * Enqueues AI-powered extraction jobs for uploaded documents.
 * GET returns current extraction status for polling.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { Document } from '../../../../data/entities'
import { EXTRACT_QUEUE_NAME, type ExtractPayload } from '../../../../workers/document-extract'
import { createLogger } from '@open-mercato/logger'

const logger = createLogger('documents')

const MAX_RETRIES = 3

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['documents.manage'],
  },
  GET: {
    requireAuth: true,
    requireFeatures: ['documents.manage'],
  },
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const documentId = params.id

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    const document = await em.findOne(Document, {
      id: documentId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Already in progress
    if (document.processingStatus === 'queued' || document.processingStatus === 'processing') {
      return NextResponse.json(
        { ok: true, queued: true, documentId, processingStatus: document.processingStatus, message: 'Extraction already in progress' },
        { status: 202 },
      )
    }

    // Max retries exceeded
    if (document.processingStatus === 'failed' && document.retryCount >= MAX_RETRIES) {
      return NextResponse.json(
        { error: `Max retries (${MAX_RETRIES}) exceeded. Manual intervention required.` },
        { status: 400 },
      )
    }

    // Enqueue extraction job
    document.processingStatus = 'queued'
    await em.flush()

    const { createQueue } = await import('@open-mercato/queue')
    const strategy = (process.env.QUEUE_STRATEGY || 'local') as 'local' | 'async'
    const queue = createQueue<ExtractPayload>(EXTRACT_QUEUE_NAME, strategy)
    await queue.enqueue({
      documentId: document.id,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
    })

    logger.info('documents.document.extraction.queued', {
      documentId: document.id,
      category: document.category,
      tenantId: document.tenantId,
      organizationId: document.organizationId,
      retryCount: document.retryCount,
    })

    return NextResponse.json(
      { ok: true, queued: true, documentId: document.id, processingStatus: 'queued' },
      { status: 202 },
    )
  } catch (error: any) {
    logger.error('documents.document.extraction.enqueue_failed', {
      error: error.message || 'Unknown error',
      stack: error.stack,
    })

    return NextResponse.json(
      { error: 'Failed to enqueue extraction', message: error.message || 'Unknown error' },
      { status: 500 },
    )
  }
}

/**
 * GET endpoint to check extraction status for a document
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const documentId = params.id

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    const document = await em.findOne(Document, {
      id: documentId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.processingStatus === 'pending') {
      return NextResponse.json({ extracted: false, processingStatus: 'pending' })
    }

    return NextResponse.json({
      extracted: document.processingStatus === 'completed',
      processingStatus: document.processingStatus,
      processedAt: document.processedAt,
      documentType: document.documentType,
      documentTypeConfidence: document.documentTypeConfidence,
      consensusConfidence: document.consensusConfidence,
      consensusRecommendation: document.consensusRecommendation,
      extractedData: document.extractedData,
      retryCount: document.retryCount,
      lastError: document.lastError,
    })
  } catch (error: any) {
    logger.error('documents.document.extraction.status_error', {
      error: error.message || 'Unknown error',
    })

    return NextResponse.json(
      { error: 'Failed to get extraction status', message: error.message || 'Unknown error' },
      { status: 500 },
    )
  }
}
