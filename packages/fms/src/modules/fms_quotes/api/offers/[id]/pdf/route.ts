import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsOffer } from '../../../../data/entities'
import { FmsDocument } from '../../../../../fms_documents/data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
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
  const { id: offerId } = await params
  const auth = await getAuthFromRequest(request)

  if (!auth || !auth.orgId || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    const { result } = await commandBus.execute('fms_quotes.offers.generate_pdf', {
      input: {
        offerId,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? null,
        resourceKind: 'fms_quotes.offer',
        resourceId: offerId,
      },
    })

    const typedResult = result as { documentId: string; url: string; fileName: string }
    return NextResponse.json({
      ok: true,
      documentId: typedResult.documentId,
      url: typedResult.url,
      fileName: typedResult.fileName,
    })
  } catch (error: any) {
    console.error('[offers/pdf] generate error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: 'Failed to generate PDF', message: error.message },
      { status: 500 }
    )
  }
}
