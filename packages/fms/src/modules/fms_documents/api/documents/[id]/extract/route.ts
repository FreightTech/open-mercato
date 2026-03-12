/**
 * FMS Documents - Document Extraction API
 * Triggers AI-powered extraction on uploaded documents (invoices, B/L, customs, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, FmsDocumentPage } from '../../../../data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import type { PipelineOrchestrator } from '../../../../services/pipeline/orchestrator'
import type { PageImageService } from '../../../../services/page-image.service'
import type { DocumentType } from '../../../../data/schema-types'
import type { DocumentProcessedPayload } from '../../../../events'
import { createLogger, getMeter } from '@open-mercato/logger'

const logger = createLogger('fms_documents')
const meter = getMeter('fms_documents')

// Create metrics once at module scope
const extractionCounter = meter.createCounter('fms.documents.extracted', {
  description: 'Number of documents successfully extracted',
  unit: '1',
})

const extractionDurationHistogram = meter.createHistogram('fms.documents.extraction.duration', {
  description: 'Document extraction duration in milliseconds',
  unit: 'ms',
})

function extractString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

function extractNumericString(data: Record<string, unknown>, path: string): string | null {
  const parts = path.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[part]
  }
  if (current == null) return null
  const num = typeof current === 'number' ? current : parseFloat(String(current))
  return isNaN(num) ? null : num.toFixed(2)
}

function mapDocumentNumber(documentType: DocumentType, data: Record<string, unknown>): string | null {
  switch (documentType) {
    case 'invoice': return extractString(data.invoice_number)
    case 'bill_of_lading': return extractString(data.bl_number)
    case 'customs_declaration': return extractString(data.mrn_number)
    case 'delivery_note': return extractString(data.dn_number)
    case 'booking_confirmation': return extractString(data.booking_number)
    case 'packing_list': return extractString(data.packing_list_number)
    case 'vgm_certificate': return extractString(data.container_number)
    default: return null
  }
}

function mapDocumentDate(documentType: DocumentType, data: Record<string, unknown>): Date | null {
  let dateStr: string | null = null
  switch (documentType) {
    case 'invoice': dateStr = extractString(data.invoice_date); break
    case 'bill_of_lading': dateStr = extractString(data.issue_date); break
    case 'customs_declaration': dateStr = extractString(data.declaration_date); break
    case 'delivery_note': dateStr = extractString(data.delivery_date); break
    case 'packing_list': dateStr = extractString(data.date); break
    case 'vgm_certificate': dateStr = extractString(data.weighing_date); break
    default: return null
  }
  if (!dateStr) return null
  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? null : parsed
}

function mapSellerName(documentType: DocumentType, data: Record<string, unknown>): string | null {
  switch (documentType) {
    case 'invoice': return extractString((data.seller as any)?.name)
    case 'bill_of_lading': return extractString((data.shipper as any)?.name)
    case 'customs_declaration': return extractString((data.exporter as any)?.name)
    case 'delivery_note': return extractString((data.sender as any)?.name)
    case 'booking_confirmation': return extractString((data.shipper as any)?.name)
    case 'packing_list': return extractString((data.shipper as any)?.name)
    case 'vgm_certificate': return extractString((data.submitting_company as any)?.name)
    default: return null
  }
}

function mapBuyerName(documentType: DocumentType, data: Record<string, unknown>): string | null {
  switch (documentType) {
    case 'invoice': return extractString((data.buyer as any)?.name)
    case 'bill_of_lading': return extractString((data.consignee as any)?.name)
    case 'customs_declaration': return extractString((data.declarant as any)?.name)
    case 'delivery_note': return extractString((data.receiver as any)?.name)
    case 'booking_confirmation': return extractString((data.consignee as any)?.name)
    case 'packing_list': return extractString((data.consignee as any)?.name)
    default: return null
  }
}

/**
 * Normalize container size/type text to ISO code.
 * Maps common descriptions to standard codes (20GP, 40GP, 40HC, etc.)
 */
function normalizeContainerType(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim().toUpperCase()

  // Already an ISO code
  if (/^(20|40|45)(GP|HC|RF|OT|FR|TK|PL)$/.test(s)) return s

  // Parse from text like "40' Hi-Cube Container", "20' Standard", "40' Reefer"
  const sizeMatch = s.match(/(\d{2})['']?\s*/)
  const size = sizeMatch ? sizeMatch[1] : null
  if (!size) return raw.trim()

  if (/HI[\s-]?CUBE|HIGH[\s-]?CUBE|HC/.test(s)) return `${size}HC`
  if (/REEFER|REFRIGERAT/.test(s)) return `${size}RF`
  if (/OPEN[\s-]?TOP/.test(s)) return `${size}OT`
  if (/FLAT[\s-]?RACK/.test(s)) return `${size}FR`
  if (/TANK/.test(s)) return `${size}TK`
  if (/PLATFORM/.test(s)) return `${size}PL`
  if (/STANDARD|DRY|GP/.test(s)) return `${size}GP`

  // Default: size + GP for standard containers
  return `${size}GP`
}

/**
 * Post-process consensus data to normalize LLM field name variants
 * and standardize values like container types.
 */
function normalizeConsensusData(data: Record<string, unknown>): Record<string, unknown> {
  // Normalize currency: LLMs sometimes return {PLN: amount, USD: amount} instead of a string
  if (data.currency && typeof data.currency === 'object' && !Array.isArray(data.currency)) {
    const keys = Object.keys(data.currency as Record<string, unknown>)
    data.currency = keys[0] ?? null
  }
  // Same for nested totals.currency
  const totals = data.totals as Record<string, unknown> | undefined
  if (totals?.currency && typeof totals.currency === 'object' && !Array.isArray(totals.currency)) {
    const keys = Object.keys(totals.currency as Record<string, unknown>)
    totals.currency = keys[0] ?? null
  }

  // Normalize containers array (booking confirmations, B/L)
  const containers = data.containers
  if (Array.isArray(containers)) {
    data.containers = containers.map((c: any) => {
      if (typeof c !== 'object' || !c) return c
      const normalized: Record<string, unknown> = { ...c }
      // Map size_type → type if type is missing
      if (!normalized.type && normalized.size_type) {
        normalized.type = normalizeContainerType(normalized.size_type)
        delete normalized.size_type
      } else if (normalized.type) {
        normalized.type = normalizeContainerType(normalized.type)
      }
      return normalized
    })
  }

  // Normalize container_details array (B/L documents)
  const containerDetails = data.container_details
  if (Array.isArray(containerDetails)) {
    data.container_details = containerDetails.map((c: any) => {
      if (typeof c !== 'object' || !c) return c
      const normalized: Record<string, unknown> = { ...c }
      if (normalized.container_type) {
        normalized.container_type = normalizeContainerType(normalized.container_type)
      }
      return normalized
    })
  }

  // Normalize line_items: LLMs often use variant field names
  // e.g. "charge" instead of "description", "rate" instead of "unit_price_net"
  const lineItems = data.line_items
  if (Array.isArray(lineItems)) {
    data.line_items = lineItems.map((item: any) => {
      if (typeof item !== 'object' || !item) return item
      const n: Record<string, unknown> = { ...item }

      // Map field name variants → canonical names
      if (!n.description && n.charge) { n.description = n.charge; delete n.charge }
      if (!n.description && n.service) { n.description = n.service; delete n.service }
      if (!n.description && n.charge_name) { n.description = n.charge_name; delete n.charge_name }

      if (n.unit_price_net == null && n.rate != null) { n.unit_price_net = n.rate; delete n.rate }
      if (n.unit_price_net == null && n.unit_price != null) { n.unit_price_net = n.unit_price; delete n.unit_price }
      if (n.unit_price_net == null && n.price != null) { n.unit_price_net = n.price; delete n.price }

      if (n.net_amount == null && n.total != null) { n.net_amount = n.total; delete n.total }
      if (n.net_amount == null && n.amount != null) { n.net_amount = n.amount; delete n.amount }
      if (n.net_amount == null && n.total_amount != null) { n.net_amount = n.total_amount; delete n.total_amount }

      if (n.gross_amount == null && n.net_amount != null) { n.gross_amount = n.net_amount }

      // Parse quantity string like "7 x 20DV" into quantity (number) + unit (string)
      if (typeof n.quantity === 'string') {
        const qtyMatch = (n.quantity as string).match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(.+)$/i)
        if (qtyMatch) {
          n.quantity = parseFloat(qtyMatch[1])
          if (!n.unit) n.unit = qtyMatch[2].trim()
        } else {
          const parsed = parseFloat(n.quantity as string)
          if (!isNaN(parsed)) n.quantity = parsed
        }
      }

      return n
    })
  }

  // Normalize bank_account: LLMs sometimes return object instead of string
  if (data.bank_account && typeof data.bank_account === 'object' && !Array.isArray(data.bank_account)) {
    const ba = data.bank_account as Record<string, unknown>
    // Pick the first IBAN-like value, or concatenate key:value pairs
    const ibanKeys = ['EUR', 'PLN', 'USD', 'GBP', 'CHF']
    const firstIban = ibanKeys.find(k => typeof ba[k] === 'string')
    if (firstIban) {
      const parts = ibanKeys.filter(k => typeof ba[k] === 'string').map(k => `${k}: ${ba[k]}`)
      if (ba.bank_name) parts.push(`Bank: ${ba.bank_name}`)
      data.bank_account = parts.join('; ')
    }
  }

  return data
}

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['fms_documents.manage'],
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

    // Find the document
    const document = await em.findOne(FmsDocument, {
      id: documentId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const orchestrator = container.resolve<PipelineOrchestrator>('fmsPipelineOrchestrator')

    // Get attachment file buffer
    const attachment = await em.findOne(Attachment, { id: document.attachmentId })
    if (!attachment?.partitionCode || !attachment?.storagePath) {
      return NextResponse.json({ error: 'Attachment file not found' }, { status: 404 })
    }

    const filePath = resolveAttachmentAbsolutePath(
      attachment.partitionCode,
      attachment.storagePath,
      attachment.storageDriver
    )

    const fs = await import('fs')
    const path = await import('path')
    const fileBuffer = fs.readFileSync(filePath)
    const filename = path.basename(filePath)

    // Update status to processing
    document.processingStatus = 'processing'
    await em.flush()

    // Log extraction start
    const extractionStartTime = Date.now()
    logger.info('fms.document.extraction.started', {
      documentId: document.id,
      category: document.category,
      tenantId: document.tenantId,
      organizationId: document.organizationId,
      brandId: request.headers.get('x-brand-id') || undefined,
    })

    // Run the pipeline
    const pipelineResult = await orchestrator.processDocument(fileBuffer, filename)

    // Store results on document
    document.processingStatus = 'completed'
    document.processingResult = pipelineResult as unknown as Record<string, unknown>
    document.consensusConfidence = pipelineResult.consensus.overallConfidence.toFixed(2)
    document.consensusRecommendation = pipelineResult.consensus.recommendation
    document.documentType = pipelineResult.documentType
    document.documentTypeConfidence = pipelineResult.documentTypeConfidence
    document.extractedData = pipelineResult.consensus.consensusData
    document.processedAt = new Date()

    // Populate real columns from extraction results
    const consensusData = normalizeConsensusData(pipelineResult.consensus.consensusData)
    pipelineResult.consensus.consensusData = consensusData

    document.rawText = pipelineResult.rawText
    document.documentData = consensusData

    // Transportation fields from LLM consensus data (not regex)
    // Handle multiple field name variants LLMs may produce
    const transport = consensusData.transportation as Record<string, unknown> | undefined
    const routing = consensusData.routing as Record<string, unknown> | undefined
    const vessel = consensusData.vessel as Record<string, unknown> | undefined

    // HBL (House Bill of Lading)
    document.blNumber = extractString(transport?.hbl_number)
      ?? extractString(transport?.hbl_no)
      ?? extractString(transport?.bl_number)
      ?? extractString(consensusData.bl_number)
      ?? null

    // MBL (Master Bill of Lading)
    document.mblNumber = extractString(transport?.mbl_number)
      ?? extractString(transport?.mbl_no)
      ?? extractString(consensusData.mbl_number)
      ?? null

    document.bookingNumber = extractString(transport?.booking_number)
      ?? extractString(transport?.job_no)
      ?? extractString(consensusData.booking_number)
      ?? null

    // Container numbers: handle various field names
    const containerSrc = transport?.container_numbers ?? transport?.containers_no ?? consensusData.container_details
    document.containerNumbers = Array.isArray(containerSrc)
      ? containerSrc.map((c: any) => typeof c === 'string' ? c : c?.container_number).filter(Boolean)
      : null

    // Vessel: handle combined "VESSEL/VOYAGE" format
    const rawVessel = extractString(transport?.vessel_name) ?? extractString(transport?.vessel) ?? extractString(vessel?.name)
    if (rawVessel && rawVessel.includes('/')) {
      const [vesselPart, voyagePart] = rawVessel.split('/')
      document.vesselName = vesselPart.trim() || null
      document.voyageNumber = extractString(transport?.voyage_number) ?? (voyagePart.trim() || null)
    } else {
      document.vesselName = rawVessel ?? null
      document.voyageNumber = extractString(transport?.voyage_number) ?? extractString(vessel?.voyage_number) ?? null
    }

    // Ports: handle abbreviated field names (pol/pod)
    document.portOfLoading = extractString(transport?.port_of_loading)
      ?? extractString(transport?.pol)
      ?? extractString(routing?.port_of_loading)
      ?? null

    document.portOfDischarge = extractString(transport?.port_of_discharge)
      ?? extractString(transport?.pod)
      ?? extractString(routing?.port_of_discharge)
      ?? null

    // Type-specific field mapping
    document.documentNumber = mapDocumentNumber(pipelineResult.documentType, consensusData)
    document.documentDate = mapDocumentDate(pipelineResult.documentType, consensusData)
    document.sellerName = mapSellerName(pipelineResult.documentType, consensusData)
    document.buyerName = mapBuyerName(pipelineResult.documentType, consensusData)
    document.currency = extractString(consensusData.currency) ?? extractString((consensusData.totals as any)?.currency) ?? null
    document.totalGrossAmount = extractNumericString(consensusData, 'totals.gross_amount') ?? extractNumericString(consensusData, 'totals.total_customs_value') ?? null

    await em.flush()

    // Log extraction success
    const extractionDurationMs = Date.now() - extractionStartTime
    const brandId = request.headers.get('x-brand-id') || undefined
    
    logger.info('fms.document.extraction.completed', {
      documentId: document.id,
      category: document.category,
      documentType: document.documentType,
      durationMs: extractionDurationMs,
      confidence: document.consensusConfidence,
      tenantId: document.tenantId,
      organizationId: document.organizationId,
      brandId,
    })

    // Emit metrics
    extractionCounter.add(1, {
      category: document.category || 'unknown',
      documentType: document.documentType || 'unknown',
      status: 'success',
      tenantId: document.tenantId,
      organizationId: document.organizationId,
      brandId: brandId || 'unknown',
    })

    extractionDurationHistogram.record(extractionDurationMs, {
      category: document.category || 'unknown',
      documentType: document.documentType || 'unknown',
      tenantId: document.tenantId,
      organizationId: document.organizationId,
      brandId: brandId || 'unknown',
    })

    const responsePayload = {
      ok: true,
      documentId: document.id,
      documentType: pipelineResult.documentType,
      documentTypeConfidence: pipelineResult.documentTypeConfidence,
      consensus: {
        recommendation: pipelineResult.consensus.recommendation,
        overallConfidence: pipelineResult.consensus.overallConfidence,
        data: pipelineResult.consensus.consensusData,
        disagreements: pipelineResult.consensus.disagreements,
        providerCount: pipelineResult.consensus.providerResults.length,
      },
      processingTimeMs: pipelineResult.processingTimeMs,
      tokenUsage: pipelineResult.totalUsage,
    }

    // Always extract page images for PDF files if none exist yet
    const pageAttachment = await em.findOne(Attachment, { id: document.attachmentId })
    if (pageAttachment) {
      const isPdf = pageAttachment.mimeType === 'application/pdf' ||
        (pageAttachment.fileName || '').toLowerCase().endsWith('.pdf')
      if (isPdf) {
        const existingPages = await em.count(FmsDocumentPage, { document: documentId })
        if (existingPages === 0) {
          try {
            const filePath = resolveAttachmentAbsolutePath(
              pageAttachment.partitionCode, pageAttachment.storagePath, pageAttachment.storageDriver
            )
            const fs = await import('fs')
            const fileBuffer = fs.readFileSync(filePath)
            const pageImageService = container.resolve<PageImageService>('fmsDocumentPageImageService')
            const pageResults = await pageImageService.extractAndStorePdfPages(
              fileBuffer, documentId, auth.orgId!, auth.tenantId!
            )
            if (pageResults.length > 0) {
              const pageEm = em.fork()
              for (const pageResult of pageResults) {
                pageEm.persist(pageEm.create(FmsDocumentPage, {
                  organizationId: auth.orgId!, tenantId: auth.tenantId!,
                  document: documentId, pageNumber: pageResult.pageNumber,
                  storagePath: pageResult.storagePath,
                  storageDriver: pageImageService.getDriverId(),
                  width: pageResult.width ?? null, height: pageResult.height ?? null,
                  fileSize: pageResult.fileSize ?? null,
                }))
              }
              await pageEm.flush()
            }
          } catch (pageErr) {
            console.error('[fms_documents] Page extraction failed:', pageErr)
          }
        }
      }
    }

    // Emit document processed event for downstream subscribers (e.g., auto-create project)
    try {
      const eventBus = container.resolve('eventBus') as {
        emitEvent(event: string, payload: DocumentProcessedPayload, options?: { persistent?: boolean }): Promise<void>
      }

      // Extract container numbers from consensus data
      const containers = consensusData?.containers as Array<{ number?: string; container_number?: string }> | undefined
      const containerDetails = consensusData?.container_details as Array<{ container_number?: string }> | undefined
      const containerSrcForEvent = containers ?? containerDetails
      const containerNumbersForEvent = containerSrcForEvent
        ?.map((c) => (c as { number?: string; container_number?: string }).number ?? c.container_number)
        .filter((n): n is string => Boolean(n))

      const eventPayload: DocumentProcessedPayload = {
        id: document.id,
        tenantId: document.tenantId,
        organizationId: document.organizationId,
        category: document.category ?? 'unknown',
        bookingNumber: document.bookingNumber ?? undefined,
        blNumber: document.blNumber ?? undefined,
        containerNumbers: containerNumbersForEvent?.length ? containerNumbersForEvent : undefined,
        createdBy: document.createdBy ?? undefined,
      }

      await eventBus.emitEvent('fms_documents.document.processed', eventPayload, { persistent: true })
    } catch (eventError) {
      console.warn('[fms_documents] Failed to emit document processed event:', eventError)
    }

    return NextResponse.json(responsePayload)
  } catch (error: any) {
    console.error('[fms-documents] extraction error:', error)

    // Log extraction failure
    const brandId = request.headers.get('x-brand-id') || undefined
    logger.error('fms.document.extraction.failed', {
      error: error.message || 'Unknown error',
      stack: error.stack,
      brandId,
    })

    // Emit failure metric
    extractionCounter.add(1, {
      category: 'unknown',
      documentType: 'unknown',
      status: 'failure',
      tenantId: 'unknown',
      organizationId: 'unknown',
      brandId: brandId || 'unknown',
    })

    return NextResponse.json(
      {
        error: 'Extraction failed',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
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

    // Find the document
    const document = await em.findOne(FmsDocument, {
      id: documentId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.processingStatus === 'pending') {
      return NextResponse.json({ extracted: false })
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
    })
  } catch (error: any) {
    console.error('[fms-documents] extraction status error:', error)

    return NextResponse.json(
      {
        error: 'Failed to get extraction status',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
