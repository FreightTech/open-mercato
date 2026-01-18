import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../../../../data/entities'
import { FmsDocument } from '../../../../../fms_documents/data/entities'
import { ContractorContact } from '../../../../../contractors/data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import { promises as fs } from 'fs'
import { generateOfferPdf } from '../../../../lib/offer-pdf.service'
import { Resend } from 'resend'

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['fms_quotes.offers.manage'],
  },
}

const sendSchema = z.object({
  contactId: z.string().uuid(),
  message: z.string().max(2000).optional(),
  subject: z.string().max(200).optional(),
})

type Params = { params: Promise<{ id: string }> }

/**
 * POST: Send offer PDF to a client contact via email
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

    // Parse request body
    const body = await request.json()
    const validation = sendSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { contactId, message, subject } = validation.data

    // Find offer with quote and client
    const offer = await em.findOne(
      FmsOffer,
      {
        id: offerId,
        tenantId: auth.tenantId,
        deletedAt: null,
      },
      {
        populate: ['quote', 'quote.client', 'quote.originPorts', 'quote.destinationPorts', 'lines'],
      }
    )

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (!offer.quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Find contact
    const contact = await em.findOne(ContractorContact, {
      id: contactId,
      tenantId: auth.tenantId,
    })

    if (!contact || !contact.email) {
      return NextResponse.json({ error: 'Contact not found or has no email' }, { status: 404 })
    }

    // Get or generate PDF
    let pdfBuffer: Buffer

    if (offer.documentId) {
      // Try to get existing PDF
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
            pdfBuffer = await fs.readFile(filePath)
          } catch {
            // File doesn't exist, generate new one
            pdfBuffer = await generateOfferPdf(offerId, em)
          }
        } else {
          pdfBuffer = await generateOfferPdf(offerId, em)
        }
      } else {
        pdfBuffer = await generateOfferPdf(offerId, em)
      }
    } else {
      // Generate PDF
      pdfBuffer = await generateOfferPdf(offerId, em)
    }

    // Build email
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }

    const resend = new Resend(apiKey)
    const fromAddr = process.env.EMAIL_FROM || 'no-reply@openmercato.com'

    const clientName = offer.quote.client?.name || 'Client'
    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email

    const originPorts = offer.quote.originPorts?.getItems?.()?.map((p: any) => p.locode || p.name).join(', ') || '-'
    const destPorts = offer.quote.destinationPorts?.getItems?.()?.map((p: any) => p.locode || p.name).join(', ') || '-'

    const emailSubject = subject || `Freight Offer ${offer.offerNumber} - ${originPorts} to ${destPorts}`

    const total = (offer.lines?.getItems() || []).reduce(
      (sum, line) => sum + (parseFloat(line.amount) || 0),
      0
    )
    const formattedTotal = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: offer.currencyCode || 'USD',
    }).format(total)

    const validUntilText = offer.validUntil
      ? new Date(offer.validUntil).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Not specified'

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #1a365d; padding-bottom: 20px; margin-bottom: 20px; }
    .header h1 { color: #1a365d; margin: 0; font-size: 24px; }
    .details { background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .details-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .details-label { color: #718096; }
    .details-value { font-weight: 600; }
    .total { font-size: 24px; color: #1a365d; font-weight: bold; }
    .message { background: #fff; border-left: 4px solid #1a365d; padding: 15px; margin: 20px 0; }
    .footer { color: #718096; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Freight Offer ${offer.offerNumber}</h1>
    </div>

    <p>Dear ${contactName},</p>

    <p>Please find attached our freight offer for your shipment.</p>

    <div class="details">
      <div class="details-row">
        <span class="details-label">Route:</span>
        <span class="details-value">${originPorts} → ${destPorts}</span>
      </div>
      <div class="details-row">
        <span class="details-label">Valid Until:</span>
        <span class="details-value">${validUntilText}</span>
      </div>
      <div class="details-row">
        <span class="details-label">Total Amount:</span>
        <span class="details-value total">${formattedTotal}</span>
      </div>
    </div>

    ${message ? `<div class="message"><p>${message.replace(/\n/g, '<br>')}</p></div>` : ''}

    <p>The detailed offer is attached as a PDF document.</p>

    <p>If you have any questions, please don't hesitate to contact us.</p>

    <p>Best regards,<br>The Open Mercato Team</p>

    <div class="footer">
      <p>This email was sent by Open Mercato. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
`

    // Send email with PDF attachment
    try {
      await resend.emails.send({
        from: fromAddr,
        to: contact.email,
        subject: emailSubject,
        html: emailHtml,
        attachments: [
          {
            filename: `${offer.offerNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`,
            content: pdfBuffer.toString('base64'),
          },
        ],
      })
    } catch (emailError: any) {
      console.error('[offers/send] email error:', emailError)
      return NextResponse.json(
        { error: 'Failed to send email', message: emailError.message },
        { status: 500 }
      )
    }

    // Update offer status to 'sent' if it was 'draft'
    if (offer.status === 'draft') {
      offer.status = 'sent'
      offer.updatedAt = new Date()
      await em.flush()
    }

    return NextResponse.json({
      ok: true,
      message: `Offer sent to ${contact.email}`,
      sentTo: {
        email: contact.email,
        name: contactName,
      },
      offerStatus: offer.status,
    })
  } catch (error: any) {
    console.error('[offers/send] error:', error)
    return NextResponse.json(
      { error: 'Failed to send offer', message: error.message },
      { status: 500 }
    )
  }
}
