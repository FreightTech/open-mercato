import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsOffer, FmsOfferLine, FmsQuote, FmsQuoteLine } from '../data/entities'
import { FmsProject, FmsProjectLine, FmsSeaContainer } from '../../fms_projects/data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'
import { FmsProduct } from '../../fms_products/data/entities'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
} from './shared'
import { generateProjectNumber } from '../../fms_projects/commands/shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'
import { z } from 'zod'
import type { ContainerType } from '../../fms_projects/data/types'

const projectCrudIndexer: CrudIndexerConfig<FmsProject> = {
  entityType: E.fms_projects.fms_project,
}

const offerCrudIndexer: CrudIndexerConfig<FmsOffer> = {
  entityType: E.fms_quotes.fms_offer,
}

const quoteCrudIndexer: CrudIndexerConfig<FmsQuote> = {
  entityType: E.fms_quotes.fms_quote,
}

const seaContainerCrudIndexer: CrudIndexerConfig<FmsSeaContainer> = {
  entityType: E.fms_projects.fms_sea_container,
}

// ============================================================================
// Convert Offer to Project Command
// ============================================================================

const convertOfferToProjectInputSchema = z.object({
  offerId: z.string().uuid(),
  // Selected line IDs (required)
  lineIds: z.array(z.string().uuid()),
  // Map of lineId -> units count (for container creation)
  lineUnits: z.record(z.string().uuid(), z.number().int().min(0)).optional(),
})

type ConvertOfferToProjectInput = z.infer<typeof convertOfferToProjectInputSchema>

type ConvertOfferToProjectResult = {
  projectId: string
  projectNumber: string
  offerId: string
  quoteId: string
  containerIds: string[]
}

type ConvertOfferToProjectUndoPayload = {
  projectId: string
  offerId: string
  quoteId: string
  previousOfferStatus: string
  previousQuoteStatus: string
  containerIds: string[]
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

    const quote = offer.quote
    const previousOfferStatus = offer.status
    const previousQuoteStatus = quote.status

    // Validate lineIds - must have at least one
    if (!parsed.lineIds || parsed.lineIds.length === 0) {
      throw new CrudHttpError(400, { error: 'At least one line must be selected' })
    }

    // Get all offer lines
    const allOfferLines = await em.find(FmsOfferLine, {
      offer: offer.id,
      deletedAt: null,
    }, { orderBy: { lineNumber: 'ASC' } })

    // Filter to selected lines only
    const selectedLineIds = new Set(parsed.lineIds)
    const selectedLines = allOfferLines.filter(line => selectedLineIds.has(line.id))

    if (selectedLines.length === 0) {
      throw new CrudHttpError(400, { error: 'No valid lines found for the provided IDs' })
    }

    // Get source quote line IDs for location extraction
    const sourceQuoteLineIds = selectedLines
      .map(line => line.sourceQuoteLineId)
      .filter((id): id is string => Boolean(id))

    // Fetch quote lines to get location info
    const quoteLines = sourceQuoteLineIds.length > 0
      ? await em.find(FmsQuoteLine, { id: { $in: sourceQuoteLineIds }, deletedAt: null })
      : []

    // Extract unique origin and destination locations from selected lines
    const originLocationIds = [...new Set(quoteLines.map(l => l.originLocationId).filter(Boolean))] as string[]
    const destLocationIds = [...new Set(quoteLines.map(l => l.destinationLocationId).filter(Boolean))] as string[]

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

    // Get origin and destination locations from quote ports (as fallback)
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
      transportModes: quote.modes || [],
      containerCount: null, // Will be updated after container creation
      currencyCode: quote.currencyCode || 'USD',
      projectDate: now,
      createdAt: now,
      updatedAt: now,
      requiresInsurance: false,
      requiresCustomsBrokerage: false,
      isHazardous: false,
      isDomestic: false,
    })

    // Set relationships
    project.offer = offer
    project.quote = quote

    if (quote.client) {
      project.client = quote.client
    }

    // Auto-extract origin location from selected lines, fallback to quote ports
    if (originLocationIds.length > 0) {
      const location = await em.findOne(FmsLocation, { id: originLocationIds[0] })
      if (location) project.originLocation = location
    } else if (originPorts.length > 0) {
      project.originLocation = originPorts[0]
    }

    // Auto-extract destination location from selected lines, fallback to quote ports
    if (destLocationIds.length > 0) {
      const location = await em.findOne(FmsLocation, { id: destLocationIds[0] })
      if (location) project.destinationLocation = location
    } else if (destPorts.length > 0) {
      project.destinationLocation = destPorts[0]
    }

    // Calculate estimated cost from selected lines only
    let totalAmount = 0
    for (const line of selectedLines) {
      totalAmount += parseFloat(line.amount) || 0
    }
    if (totalAmount > 0) {
      project.estimatedCost = totalAmount.toFixed(4)
    }

    em.persist(project)

    // Fetch products with chargeCode to determine which lines create containers
    const productIds = selectedLines
      .map(line => line.productId)
      .filter((id): id is string => Boolean(id))

    const products = productIds.length > 0
      ? await em.find(FmsProduct, { id: { $in: productIds } }, { populate: ['chargeCode'] })
      : []
    const productMap = new Map(products.map(p => [p.id, p]))

    // Copy selected offer lines to project lines for financial tracking (with product traceability)
    const createdContainers: FmsSeaContainer[] = []

    for (let i = 0; i < selectedLines.length; i++) {
      const line = selectedLines[i]
      const product = line.productId ? productMap.get(line.productId) : null
      const chargeUnit = product?.chargeCode?.chargeUnit || null

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
        priceId: null, // No longer tracked - pricing is in variant
        // Product identification
        productName: line.productName || 'Unknown Product',
        chargeCode: line.chargeCode,
        // Type fields
        chargeCategory: null, // Field removed from offer line
        chargeUnit: chargeUnit, // Now populated from product's chargeCode
        containerSize: line.containerSize,
        containerType: null, // Field removed from offer line
        // Pricing
        quantity: '1', // Each line represents one unit
        currencyCode: line.currencyCode,
        soldUnitPrice: line.unitPrice,
        soldAmount: line.amount,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(projectLine)

      // Create containers for lines with chargeUnit='container' and a valid container size
      if (chargeUnit === 'container' && line.containerSize) {
        // Get units count from lineUnits map, default to 1
        const units = parsed.lineUnits?.[line.id] ?? 1

        // Normalize container size to match ContainerType enum
        const normalizedSize = line.containerSize.toLowerCase().replace(/[^a-z0-9]/g, '') as ContainerType

        // Create one container per unit
        for (let unitIndex = 0; unitIndex < units; unitIndex++) {
          const container = em.create(FmsSeaContainer, {
            organizationId: offer.organizationId,
            tenantId: tenantId,
            project,
            containerType: normalizedSize,
            ownershipType: 'coc',
            status: 'not_ready',
            isHazardous: false,
            createdAt: now,
            updatedAt: now,
          })
          em.persist(container)
          createdContainers.push(container)
        }
      }
    }

    // Update project container count
    if (createdContainers.length > 0) {
      project.containerCount = createdContainers.length
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

    // Emit side effects for created containers
    for (const container of createdContainers) {
      await emitCrudSideEffects({
        dataEngine: de,
        action: 'created',
        entity: container,
        identifiers: {
          id: container.id,
          organizationId: container.organizationId,
          tenantId: container.tenantId,
        },
        indexer: seaContainerCrudIndexer,
      })
    }

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
      containerIds: createdContainers.map(c => c.id),
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
          containerIds: result.containerIds,
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

    // Delete created containers
    const deletedContainers: FmsSeaContainer[] = []
    if (payload.containerIds && payload.containerIds.length > 0) {
      for (const containerId of payload.containerIds) {
        const container = await em.findOne(FmsSeaContainer, { id: containerId })
        if (container) {
          container.deletedAt = new Date()
          deletedContainers.push(container)
        }
      }
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

    // Emit undo side effects for deleted containers
    for (const container of deletedContainers) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'deleted',
        entity: container,
        identifiers: {
          id: container.id,
          organizationId: container.organizationId,
          tenantId: container.tenantId,
        },
        indexer: seaContainerCrudIndexer,
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
