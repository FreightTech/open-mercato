import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../../../../data/entities'
import { FmsDocument, DocumentCategory } from '../../../../../fms_documents/data/entities'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import { randomUUID } from 'crypto'
import { buildAttachmentFileUrl } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { storePartitionFile } from '@open-mercato/core/modules/attachments/lib/storage'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import { promises as fs } from 'fs'
import { generateOfferPdf } from '../../../../lib/offer-pdf.service'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_quotes.offers.view'],
  },
  POST: {
    requireAuth: true,
    requireFeatures: ['fms_quotes.offers.manage'],
  },
}

type Params = { params: Promise<{ id: string }> }

/**
 * GET: Download existing PDF or generate on-the-fly
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: offerId } = await params
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find offer
    const offer = await em.findOne(FmsOffer, {
      id: offerId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    // Check if PDF already exists
    if (offer.documentId) {
      const document = await em.findOne(FmsDocument, {
        id: offer.documentId,
        tenantId: auth.tenantId,
        deletedAt: null,
      })

      if (document) {
        const attachment = await em.findOne(Attachment, { id: document.attachmentId })
        if (attachment) {
          const filePath = resolveAttachmentAbsolutePath(
            attachment.partitionCode,
            attachment.storagePath,
            attachment.storageDriver
          )

          try {
            await fs.access(filePath)
            const fileBuffer = await fs.readFile(filePath)

            return new NextResponse(fileBuffer, {
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Length': String(fileBuffer.length),
                'Content-Disposition': `attachment; filename="${offer.offerNumber}.pdf"`,
                'Cache-Control': 'private, max-age=3600',
              },
            })
          } catch {
            // File doesn't exist, generate on-the-fly
          }
        }
      }
    }

    // Generate PDF on-the-fly (not stored)
    const pdfBuffer = await generateOfferPdf(offerId, em)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBuffer.length),
        'Content-Disposition': `inline; filename="${offer.offerNumber}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('[offers/pdf] download error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF', message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST: Generate PDF, store as FmsDocument, link to offer
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: offerId } = await params
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = auth.orgId
    const tenantId = auth.tenantId
    const userId = auth.sub ?? auth.email ?? null

    // Find offer
    const offer = await em.findOne(FmsOffer, {
      id: offerId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    // Generate PDF
    const pdfBuffer = await generateOfferPdf(offerId, em)
    const fileName = `${offer.offerNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`

    // Store file
    const partitionCode = 'fmsDocuments'
    let stored
    try {
      stored = await storePartitionFile({
        partitionCode,
        orgId,
        tenantId,
        fileName,
        buffer: pdfBuffer,
      })
    } catch (error) {
      console.error('[offers/pdf] failed to persist file', error)
      return NextResponse.json({ error: 'Failed to persist PDF' }, { status: 500 })
    }

    // Create document and attachment in transaction
    const result = await em.transactional(async (em) => {
      // Get or create partition
      let partition = await em.findOne(AttachmentPartition, { code: partitionCode })
      if (!partition) {
        partition = em.create(AttachmentPartition, {
          code: partitionCode,
          title: 'FMS Documents',
          description: 'Documents for freight management (offers, invoices, customs, BOL)',
          storageDriver: 'local',
          isPublic: false,
          requiresOcr: false,
        })
        await em.persist(partition)
      }

      const documentId = randomUUID()
      const attachmentId = randomUUID()

      // Create FmsDocument
      const document = em.create(FmsDocument, {
        id: documentId,
        organizationId: orgId,
        tenantId: tenantId,
        name: `Offer ${offer.offerNumber}`,
        category: DocumentCategory.OFFER,
        description: `Generated PDF for offer ${offer.offerNumber}`,
        attachmentId: attachmentId,
        relatedEntityId: offer.id,
        relatedEntityType: 'fms_quotes:fms_offer',
        createdBy: userId,
        updatedBy: userId,
      })

      // Create attachment
      const attachment = em.create(Attachment, {
        id: attachmentId,
        entityId: 'fms_documents:fms_document',
        recordId: documentId,
        tenantId: tenantId,
        organizationId: orgId,
        fileName,
        mimeType: 'application/pdf',
        fileSize: pdfBuffer.length,
        partitionCode: partition.code,
        storageDriver: partition.storageDriver || 'local',
        storagePath: stored.storagePath,
        url: buildAttachmentFileUrl(attachmentId),
        storageMetadata: {
          generatedFor: 'offer',
          offerId: offer.id,
          offerNumber: offer.offerNumber,
        },
      })

      // Update offer with document reference
      offer.documentId = documentId
      offer.updatedAt = new Date()

      await em.persist([document, attachment, offer])

      return { document, attachment }
    })

    return NextResponse.json({
      ok: true,
      documentId: result.document.id,
      url: `/api/fms_documents/documents/${result.document.id}/download`,
      fileName,
    })
  } catch (error: any) {
    console.error('[offers/pdf] generate error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF', message: error.message },
      { status: 500 }
    )
  }
}
