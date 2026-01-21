import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsOffer, FmsOfferLine, FmsQuote } from '../data/entities'
import { FmsProject, FmsProjectLine } from '../../fms_projects/data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
} from './shared'
import { generateProjectNumber } from '../../fms_projects/commands/shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'
import { z } from 'zod'

const projectCrudIndexer: CrudIndexerConfig<FmsProject> = {
  entityType: E.fms_projects.fms_project,
}

const offerCrudIndexer: CrudIndexerConfig<FmsOffer> = {
  entityType: E.fms_quotes.fms_offer,
}

const quoteCrudIndexer: CrudIndexerConfig<FmsQuote> = {
  entityType: E.fms_quotes.fms_quote,
}

// ============================================================================
// Convert Offer to Project Command
// ============================================================================

const convertOfferToProjectInputSchema = z.object({
  offerId: z.string().uuid(),
})

type ConvertOfferToProjectInput = z.infer<typeof convertOfferToProjectInputSchema>

type ConvertOfferToProjectResult = {
  projectId: string
  projectNumber: string
  offerId: string
  quoteId: string
}

type ConvertOfferToProjectUndoPayload = {
  projectId: string
  offerId: string
  quoteId: string
  previousOfferStatus: string
  previousQuoteStatus: string
}

const convertOfferToProjectCommand: CommandHandler<ConvertOfferToProjectInput, ConvertOfferToProjectResult> = {
  id: 'fms_quotes.offers.convert_to_project',
  async execute(input, ctx) {
    const parsed = convertOfferToProjectInputSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const tenantId = ctx.auth?.tenantId
    const orgId = ctx.auth?.orgId

    if (!tenantId || !orgId) {
      throw new CrudHttpError(401, { error: 'Unauthorized' })
    }

    // Find offer with quote and related data
    const offer = await em.findOne(
      FmsOffer,
      {
        id: parsed.offerId,
        tenantId,
        deletedAt: null,
      },
      {
        populate: ['quote', 'quote.client', 'quote.originPorts', 'quote.destinationPorts'],
      }
    )

    if (!offer) {
      throw new CrudHttpError(404, { error: 'Offer not found' })
    }

    ensureTenantScope(ctx, offer.tenantId)
    ensureOrganizationScope(ctx, offer.organizationId)

    if (!offer.quote) {
      throw new CrudHttpError(400, { error: 'Offer must have a quote' })
    }

    // Validate offer status - must be 'sent' or 'accepted'
    if (offer.status !== 'sent' && offer.status !== 'accepted') {
      throw new CrudHttpError(400, { error: `Cannot convert offer with status '${offer.status}'. Offer must be 'sent' or 'accepted'.` })
    }

    const quote = offer.quote
    const previousOfferStatus = offer.status
    const previousQuoteStatus = quote.status

    // Determine shipment type based on cargo type
    const shipmentType = quote.direction === 'export' ? 'EXP' : quote.direction === 'import' ? 'IMP' : 'EXP'
    const cargoType = quote.cargoType || 'fcl'
    const direction = quote.direction || 'export'

    // Generate project number
    const projectNumber = await generateProjectNumber(
      em,
      tenantId,
      offer.organizationId,
      shipmentType as any,
      cargoType as any
    )

    // Get origin and destination locations
    const originPorts = quote.originPorts?.getItems?.() || []
    const destPorts = quote.destinationPorts?.getItems?.() || []

    const now = new Date()

    // Create the project
    const project = em.create(FmsProject, {
      organizationId: offer.organizationId,
      tenantId: tenantId,
      projectNumber,
      shipmentType: shipmentType as any,
      direction: direction as any,
      cargoType: cargoType as any,
      incoterm: (quote.incoterm as any) ?? null,
      containerCount: quote.containerCount ?? null,
      currencyCode: quote.currencyCode || 'USD',
      projectDate: now,
      createdAt: now,
      updatedAt: now,
      requiresInsurance: false,
      requiresCustomsBrokerage: false,
      isHazardous: false,
    })

    // Set relationships
    project.offer = offer
    project.quote = quote

    if (quote.client) {
      project.client = quote.client
    }

    // Set origin location (first port)
    if (originPorts.length > 0) {
      project.originLocation = originPorts[0]
    }

    // Set destination location (first port)
    if (destPorts.length > 0) {
      project.destinationLocation = destPorts[0]
    }

    // Calculate estimated cost from offer total
    if (offer.totalAmount) {
      project.estimatedCost = offer.totalAmount
    }

    em.persist(project)

    // Copy offer lines to project lines for financial tracking (with product traceability)
    // Use explicit query to avoid MikroORM Collection hydration issues with cartesian products
    // (when offer is populated with multiple ManyToMany relations, getItems() returns duplicated entries)
    const offerLines = await em.find(FmsOfferLine, {
      offer: offer.id,
      deletedAt: null,
    }, { orderBy: { lineNumber: 'ASC' } })

    for (let i = 0; i < offerLines.length; i++) {
      const line = offerLines[i]
      const projectLine = em.create(FmsProjectLine, {
        organizationId: offer.organizationId,
        tenantId: tenantId,
        project,
        lineNumber: i + 1,
        // Source tracking
        sourceOfferLineId: line.id,
        sourceType: 'offer',
        // Copy product references (for traceability)
        productId: line.productId || null,
        variantId: line.variantId || null,
        priceId: line.priceId || null,
        // Product identification
        productName: line.productName || line.chargeName || 'Unknown Product',
        chargeCode: line.chargeCode,
        // Type fields
        chargeCategory: line.chargeCategory || null,
        chargeUnit: line.chargeUnit || null,
        containerSize: line.containerSize,
        containerType: line.containerType || null,
        // Pricing
        quantity: line.quantity,
        currencyCode: line.currencyCode,
        soldUnitPrice: line.unitPrice,
        soldAmount: line.amount,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(projectLine)
    }

    // Update offer status to 'accepted'
    offer.status = 'accepted'
    offer.updatedAt = now

    // Update quote status to 'won'
    quote.status = 'won'
    quote.updatedAt = now

    await em.flush()

    // Emit side effects
    const de = ctx.container.resolve('dataEngine') as DataEngine

    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: project,
      identifiers: {
        id: project.id,
        organizationId: project.organizationId,
        tenantId: project.tenantId,
      },
      indexer: projectCrudIndexer,
    })

    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: offer,
      identifiers: {
        id: offer.id,
        organizationId: offer.organizationId,
        tenantId: offer.tenantId,
      },
      indexer: offerCrudIndexer,
    })

    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: quote,
      identifiers: {
        id: quote.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
      },
      indexer: quoteCrudIndexer,
    })

    return {
      projectId: project.id,
      projectNumber: project.projectNumber,
      offerId: offer.id,
      quoteId: quote.id,
    }
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_quotes.audit.offers.convert_to_project', 'Convert offer to project'),
      resourceKind: 'fms_quotes.offer',
      resourceId: result.offerId,
      payload: {
        undo: {
          projectId: result.projectId,
          offerId: result.offerId,
          quoteId: result.quoteId,
          previousOfferStatus: 'sent', // Will be captured in actual use
          previousQuoteStatus: 'offered',
        } satisfies ConvertOfferToProjectUndoPayload,
        projectId: result.projectId,
        projectNumber: result.projectNumber,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ConvertOfferToProjectUndoPayload>(logEntry)
    if (!payload) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Delete the created project
    const project = await em.findOne(FmsProject, { id: payload.projectId })
    if (project) {
      project.deletedAt = new Date()
    }

    // Restore offer status
    const offer = await em.findOne(FmsOffer, { id: payload.offerId })
    if (offer) {
      offer.status = payload.previousOfferStatus as any
      offer.updatedAt = new Date()
    }

    // Restore quote status
    const quote = await em.findOne(FmsQuote, { id: payload.quoteId })
    if (quote) {
      quote.status = payload.previousQuoteStatus as any
      quote.updatedAt = new Date()
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine

    if (project) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'deleted',
        entity: project,
        identifiers: {
          id: project.id,
          organizationId: project.organizationId,
          tenantId: project.tenantId,
        },
        indexer: projectCrudIndexer,
      })
    }

    if (offer) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: offer,
        identifiers: {
          id: offer.id,
          organizationId: offer.organizationId,
          tenantId: offer.tenantId,
        },
        indexer: offerCrudIndexer,
      })
    }

    if (quote) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: quote,
        identifiers: {
          id: quote.id,
          organizationId: quote.organizationId,
          tenantId: quote.tenantId,
        },
        indexer: quoteCrudIndexer,
      })
    }
  },
}

registerCommand(convertOfferToProjectCommand)
