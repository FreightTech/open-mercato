import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsOffer, FmsOfferLine } from '../data/entities'
import { FmsDocument, DocumentCategory } from '../../fms_documents/data/entities'
import { ContractorContact } from '../../contractors/data/entities'
import { Attachment, AttachmentPartition } from '@open-mercato/core/modules/attachments/data/entities'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
  emitQueryIndexUpsertEvents,
  type QueryIndexEventEntry,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const offerCrudIndexer: CrudIndexerConfig<FmsOffer> = {
  entityType: E.fms_quotes.fms_offer,
}

// ============================================================================
// Send Offer Command
// ============================================================================

const sendOfferInputSchema = z.object({
  offerId: z.string().uuid(),
  contactId: z.string().uuid(),
  message: z.string().max(2000).optional(),
  subject: z.string().max(200).optional(),
})

type SendOfferInput = z.infer<typeof sendOfferInputSchema>

type SendOfferResult = {
  ok: boolean
  sentTo: { email: string; name: string }
  offerStatus: string
}

const sendOfferCommand: CommandHandler<SendOfferInput, SendOfferResult> = {
  id: 'fms_quotes.offers.send',
  isUndoable: false, // Email already sent
  async execute(input, ctx) {
    const parsed = sendOfferInputSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const tenantId = ctx.auth?.tenantId
    const orgId = ctx.auth?.orgId

    if (!tenantId || !orgId) {
      throw new CrudHttpError(401, { error: 'Unauthorized' })
    }

    // Find offer with quote and client
    const offer = await em.findOne(
      FmsOffer,
      {
        id: parsed.offerId,
        tenantId,
        deletedAt: null,
      },
      {
        populate: ['quote', 'quote.client', 'quote.originPorts', 'quote.destinationPorts', 'lines'],
      }
    )

    if (!offer) {
      throw new CrudHttpError(404, { error: 'Offer not found' })
    }

    ensureTenantScope(ctx, offer.tenantId)
    ensureOrganizationScope(ctx, offer.organizationId)

    if (!offer.quote) {
      throw new CrudHttpError(404, { error: 'Quote not found' })
    }

    // Find contact
    const contact = await em.findOne(ContractorContact, {
      id: parsed.contactId,
      tenantId,
    })

    if (!contact || !contact.email) {
      throw new CrudHttpError(404, { error: 'Contact not found or has no email' })
    }

    // Get or generate PDF
    const { generateOfferPdf } = await import('../lib/offer-pdf.service')
    const { resolveAttachmentAbsolutePath } = await import('@open-mercato/core/modules/attachments/lib/storage')
    const fs = await import('fs/promises')

    let pdfBuffer: Buffer

    if (offer.documentId) {
      // Try to get existing PDF
      const document = await em.findOne(FmsDocument, {
        id: offer.documentId,
        tenantId,
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
            pdfBuffer = await generateOfferPdf(parsed.offerId, em)
          }
        } else {
          pdfBuffer = await generateOfferPdf(parsed.offerId, em)
        }
      } else {
        pdfBuffer = await generateOfferPdf(parsed.offerId, em)
      }
    } else {
      // Generate PDF
      pdfBuffer = await generateOfferPdf(parsed.offerId, em)
    }

    // Build email
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new CrudHttpError(500, { error: 'Email service not configured' })
    }

    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const fromAddr = process.env.EMAIL_FROM || 'no-reply@openmercato.com'

    const clientName = offer.quote.client?.name || 'Client'
    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email

    const originPorts = offer.quote.originPorts?.getItems?.()?.map((p: any) => p.locode || p.name).join(', ') || '-'
    const destPorts = offer.quote.destinationPorts?.getItems?.()?.map((p: any) => p.locode || p.name).join(', ') || '-'

    const emailSubject = parsed.subject || `Freight Offer ${offer.offerNumber} - ${originPorts} to ${destPorts}`

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

    ${parsed.message ? `<div class="message"><p>${parsed.message.replace(/\n/g, '<br>')}</p></div>` : ''}

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
      throw new CrudHttpError(500, { error: 'Failed to send email', message: emailError.message })
    }

    // Update offer status to 'sent' if it was 'draft'
    if (offer.status === 'draft') {
      offer.status = 'sent'
      offer.updatedAt = new Date()
      await em.flush()
    }

    return {
      ok: true,
      sentTo: {
        email: contact.email,
        name: contactName,
      },
      offerStatus: offer.status,
    }
  },
  buildLog: async ({ input, result }) => {
    const { translate } = await resolveTranslations()
    const parsed = sendOfferInputSchema.parse(input)
    return {
      actionLabel: translate('fms_quotes.audit.offers.send', 'Send offer'),
      resourceKind: 'fms_quotes.offer',
      resourceId: parsed.offerId,
      payload: {
        contactId: parsed.contactId,
        sentTo: result.sentTo,
        offerStatus: result.offerStatus,
      },
    }
  },
}

// ============================================================================
// Generate PDF Command
// ============================================================================

const generatePdfInputSchema = z.object({
  offerId: z.string().uuid(),
})

type GeneratePdfInput = z.infer<typeof generatePdfInputSchema>

type GeneratePdfResult = {
  ok: boolean
  documentId: string
  url: string
  fileName: string
}

const generatePdfCommand: CommandHandler<GeneratePdfInput, GeneratePdfResult> = {
  id: 'fms_quotes.offers.generate_pdf',
  isUndoable: false, // Document created
  async execute(input, ctx) {
    const parsed = generatePdfInputSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const tenantId = ctx.auth?.tenantId
    const orgId = ctx.auth?.orgId
    const userId = ctx.auth?.sub ?? ctx.auth?.email ?? null

    if (!tenantId || !orgId) {
      throw new CrudHttpError(401, { error: 'Unauthorized' })
    }

    // Find offer
    const offer = await em.findOne(FmsOffer, {
      id: parsed.offerId,
      tenantId,
      deletedAt: null,
    })

    if (!offer) {
      throw new CrudHttpError(404, { error: 'Offer not found' })
    }

    ensureTenantScope(ctx, offer.tenantId)
    ensureOrganizationScope(ctx, offer.organizationId)

    // Generate PDF
    const { generateOfferPdf } = await import('../lib/offer-pdf.service')
    const pdfBuffer = await generateOfferPdf(parsed.offerId, em)
    const fileName = `${offer.offerNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`

    // Store file
    const { storePartitionFile } = await import('@open-mercato/core/modules/attachments/lib/storage')
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
      throw new CrudHttpError(500, { error: 'Failed to persist PDF' })
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

      const { buildAttachmentFileUrl: buildUrl } = await import('@open-mercato/core/modules/attachments/lib/imageUrls')

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
        url: buildUrl(attachmentId),
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

    return {
      ok: true,
      documentId: result.document.id,
      url: `/api/fms_documents/documents/${result.document.id}/download`,
      fileName,
    }
  },
  buildLog: async ({ input, result }) => {
    const { translate } = await resolveTranslations()
    const parsed = generatePdfInputSchema.parse(input)
    return {
      actionLabel: translate('fms_quotes.audit.offers.generate_pdf', 'Generate offer PDF'),
      resourceKind: 'fms_quotes.offer',
      resourceId: parsed.offerId,
      payload: {
        documentId: result.documentId,
        fileName: result.fileName,
      },
    }
  },
}

// ============================================================================
// Create Version Command
// ============================================================================

const createVersionInputSchema = z.object({
  offerId: z.string().uuid(),
})

type CreateVersionInput = z.infer<typeof createVersionInputSchema>

type CreateVersionResult = {
  id: string
  offerNumber: string
  version: number
  originalOfferId: string
}

type CreateVersionUndoPayload = {
  newOfferId: string
  originalOfferId: string
  originalStatus: string
}

const createVersionCommand: CommandHandler<CreateVersionInput, CreateVersionResult> = {
  id: 'fms_quotes.offers.create_version',
  async execute(input, ctx) {
    const parsed = createVersionInputSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const tenantId = ctx.auth?.tenantId

    // Find the original offer with lines
    const originalOffer = await em.findOne(FmsOffer, {
      id: parsed.offerId,
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
    }, { populate: ['lines'] })

    if (!originalOffer) {
      throw new CrudHttpError(404, { error: 'Offer not found' })
    }

    ensureTenantScope(ctx, originalOffer.tenantId)
    ensureOrganizationScope(ctx, originalOffer.organizationId)

    // Cannot create new version from a draft
    if (originalOffer.status === 'draft') {
      throw new CrudHttpError(400, { error: 'Cannot create new version from a draft offer' })
    }

    // Cannot create new version from a superseded offer
    if (originalOffer.status === 'superseded') {
      throw new CrudHttpError(400, { error: 'Cannot create new version from a superseded offer' })
    }

    // Find all offers with same quote to get the max version
    const existingOffers = await em.find(
      FmsOffer,
      {
        quote: originalOffer.quote,
        deletedAt: null,
      },
      { orderBy: { version: 'DESC' } }
    )

    const maxVersion = existingOffers.length > 0 ? Math.max(...existingOffers.map((o) => o.version)) : 0
    const newVersion = maxVersion + 1

    // Store original status for undo
    const originalStatus = originalOffer.status

    // Create new offer
    const newOffer = new FmsOffer()
    newOffer.organizationId = originalOffer.organizationId
    newOffer.tenantId = originalOffer.tenantId
    newOffer.quote = originalOffer.quote
    newOffer.offerNumber = originalOffer.offerNumber // Keep same number
    newOffer.version = newVersion
    newOffer.status = 'draft'
    newOffer.validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days from now
    newOffer.paymentTerms = originalOffer.paymentTerms
    newOffer.specialTerms = originalOffer.specialTerms
    newOffer.customerNotes = originalOffer.customerNotes
    newOffer.currencyCode = originalOffer.currencyCode
    newOffer.totalAmount = originalOffer.totalAmount

    em.persist(newOffer)

    // Copy lines
    for (const originalLine of originalOffer.lines) {
      const newLine = new FmsOfferLine()
      newLine.organizationId = originalLine.organizationId
      newLine.tenantId = originalLine.tenantId
      newLine.offer = newOffer
      newLine.lineNumber = originalLine.lineNumber
      newLine.productName = originalLine.productName
      newLine.chargeCode = originalLine.chargeCode
      newLine.containerSize = originalLine.containerSize
      newLine.quantity = originalLine.quantity
      newLine.unitPrice = originalLine.unitPrice
      newLine.amount = originalLine.amount
      newLine.currencyCode = originalLine.currencyCode
      em.persist(newLine)
    }

    // Mark original offer as superseded
    originalOffer.status = 'superseded'
    originalOffer.supersededById = newOffer.id
    originalOffer.updatedAt = new Date()

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: newOffer,
      identifiers: {
        id: newOffer.id,
        organizationId: newOffer.organizationId,
        tenantId: newOffer.tenantId,
      },
      indexer: offerCrudIndexer,
    })

    // Emit update for original offer
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: originalOffer,
      identifiers: {
        id: originalOffer.id,
        organizationId: originalOffer.organizationId,
        tenantId: originalOffer.tenantId,
      },
      indexer: offerCrudIndexer,
    })

    return {
      id: newOffer.id,
      offerNumber: newOffer.offerNumber,
      version: newOffer.version,
      originalOfferId: originalOffer.id,
    }
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_quotes.audit.offers.create_version', 'Create offer version'),
      resourceKind: 'fms_quotes.offer',
      resourceId: result.id,
      payload: {
        undo: {
          newOfferId: result.id,
          originalOfferId: result.originalOfferId,
          originalStatus: 'sent', // Will be overwritten in actual undo
        } satisfies CreateVersionUndoPayload,
        version: result.version,
        originalOfferId: result.originalOfferId,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<CreateVersionUndoPayload>(logEntry)
    if (!payload) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Delete the new offer and its lines
    const newOffer = await em.findOne(FmsOffer, { id: payload.newOfferId }, { populate: ['lines'] })
    if (newOffer) {
      await em.nativeDelete(FmsOfferLine, { offer: newOffer })
      em.remove(newOffer)
    }

    // Restore the original offer status
    const originalOffer = await em.findOne(FmsOffer, { id: payload.originalOfferId })
    if (originalOffer) {
      originalOffer.status = payload.originalStatus as any
      originalOffer.supersededById = null
      originalOffer.updatedAt = new Date()
    }

    await em.flush()

    if (originalOffer) {
      const de = ctx.container.resolve('dataEngine') as DataEngine
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: originalOffer,
        identifiers: {
          id: originalOffer.id,
          organizationId: originalOffer.organizationId,
          tenantId: originalOffer.tenantId,
        },
        indexer: offerCrudIndexer,
      })
    }
  },
}

registerCommand(sendOfferCommand)
registerCommand(generatePdfCommand)
registerCommand(createVersionCommand)
