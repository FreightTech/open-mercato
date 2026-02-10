import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsOffer, FmsOfferCalculation, FmsOfferLine } from '../data/entities'
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
  entityType: E.fms_offers.fms_offer,
}

const seaContainerCrudIndexer: CrudIndexerConfig<FmsSeaContainer> = {
  entityType: E.fms_projects.fms_sea_container,
}

// ============================================================================
// Convert Offer to Project Command
// ============================================================================

const convertOfferToProjectInputSchema = z.object({
  offerId: z.string().uuid(),
  lineIds: z.array(z.string().uuid()).optional(),
  lineUnits: z.record(z.string().uuid(), z.number().int().min(1)).optional(),
})

type ConvertOfferToProjectInput = z.infer<typeof convertOfferToProjectInputSchema>

type ConvertOfferToProjectResult = {
  projectId: string
  projectNumber: string
  offerId: string
  containerIds: string[]
}

type ConvertOfferToProjectUndoPayload = {
  projectId: string
  offerId: string
  previousOfferStatus: string
  containerIds: string[]
}

const convertOfferToProjectCommand: CommandHandler<ConvertOfferToProjectInput, ConvertOfferToProjectResult> = {
  id: 'fms_offers.offers.convert_to_project',
  async execute(input, ctx) {
    const parsed = convertOfferToProjectInputSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const tenantId = ctx.auth?.tenantId
    const orgId = ctx.auth?.orgId

    if (!tenantId || !orgId) {
      throw new CrudHttpError(401, { error: 'Unauthorized' })
    }

    // Find offer with RFQ and calculations
    const offer = await em.findOne(
      FmsOffer,
      {
        id: parsed.offerId,
        tenantId,
        deletedAt: null,
      },
      {
        populate: ['rfq', 'calculations', 'calculations.lines'],
      }
    )

    if (!offer) {
      throw new CrudHttpError(404, { error: 'Offer not found' })
    }

    ensureTenantScope(ctx, offer.tenantId)
    ensureOrganizationScope(ctx, offer.organizationId)

    const previousOfferStatus = offer.status

    // Gather all enabled lines across all calculations
    const calculations = offer.calculations.getItems().filter(c => !c.deletedAt)
    let enabledLines: FmsOfferLine[] = []
    for (const calc of calculations) {
      const lines = calc.lines.getItems().filter(l => !l.deletedAt && l.isEnabled)
      enabledLines.push(...lines)
    }

    // If lineIds provided, filter to only those lines
    if (parsed.lineIds && parsed.lineIds.length > 0) {
      const lineIdSet = new Set(parsed.lineIds)
      enabledLines = enabledLines.filter(l => lineIdSet.has(l.id))
    }

    if (enabledLines.length === 0) {
      throw new CrudHttpError(400, { error: 'No enabled lines found in the offer calculations' })
    }

    const lineUnits = parsed.lineUnits ?? {}

    // Determine direction/cargoType from offer or RFQ
    const direction = offer.direction ?? offer.rfq?.direction ?? 'export'
    const cargoType = offer.cargoType ?? offer.rfq?.cargoType ?? 'general'
    const shipmentType = direction === 'export' ? 'EXP' : direction === 'import' ? 'IMP' : 'EXP'

    // Generate project number
    const projectNumber = await generateProjectNumber(
      em,
      tenantId,
      offer.organizationId,
      shipmentType as any,
      cargoType as any
    )

    // Resolve origin/destination from the first calculation with location IDs
    let originLocationId: string | null = null
    let destinationLocationId: string | null = null
    for (const calc of calculations) {
      if (!originLocationId && calc.originLocationId) originLocationId = calc.originLocationId
      if (!destinationLocationId && calc.destinationLocationId) destinationLocationId = calc.destinationLocationId
      if (originLocationId && destinationLocationId) break
    }

    const now = new Date()

    // Create the project
    const project = em.create(FmsProject, {
      organizationId: offer.organizationId,
      tenantId: tenantId,
      projectNumber,
      shipmentType: shipmentType as any,
      direction: direction as any,
      cargoType: cargoType as any,
      transportModes: offer.transportMode ? [offer.transportMode] : [],
      containerCount: null,
      currencyCode: 'USD',
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

    // Set origin location from calculation
    if (originLocationId) {
      const location = await em.findOne(FmsLocation, { id: originLocationId })
      if (location) project.originLocation = location
    }

    // Set destination location from calculation
    if (destinationLocationId) {
      const location = await em.findOne(FmsLocation, { id: destinationLocationId })
      if (location) project.destinationLocation = location
    }

    // Calculate estimated cost from enabled lines (sell price * quantity)
    let totalAmount = 0
    for (const line of enabledLines) {
      const qty = lineUnits[line.id] ?? 1
      totalAmount += (parseFloat(line.sellPrice) || 0) * qty
    }
    if (totalAmount > 0) {
      project.estimatedCost = totalAmount.toFixed(4)
    }

    em.persist(project)

    // Fetch products for chargeUnit on project lines
    const productIds = enabledLines
      .map(line => line.productId)
      .filter((id): id is string => Boolean(id))

    const products = productIds.length > 0
      ? await em.find(FmsProduct, { id: { $in: productIds } })
      : []
    const productMap = new Map(products.map(p => [p.id, p]))

    // Copy enabled offer lines to project lines
    const createdContainers: FmsSeaContainer[] = []

    for (let i = 0; i < enabledLines.length; i++) {
      const line = enabledLines[i]
      const product = line.productId ? productMap.get(line.productId) : null
      const chargeUnit = (product as any)?.chargeUnit || null
      const qty = lineUnits[line.id] ?? 1
      const sellPrice = parseFloat(line.sellPrice) || 0
      const soldAmount = (sellPrice * qty).toFixed(4)

      const projectLine = em.create(FmsProjectLine, {
        organizationId: offer.organizationId,
        tenantId: tenantId,
        project,
        lineNumber: i + 1,
        sourceOfferLineId: line.id,
        sourceType: 'offer',
        productId: line.productId || null,
        priceId: null,
        productName: line.productName || 'Unknown Product',
        chargeCode: line.chargeCode,
        chargeCategory: null,
        chargeUnit: chargeUnit,
        containerSize: null,
        containerType: line.containerType || null,
        quantity: String(qty),
        currencyCode: line.currencyCode,
        soldUnitPrice: line.sellPrice,
        soldAmount,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(projectLine)
    }

    // Create containers based on line containerType and user-specified quantities.
    // If multiple lines share the same containerType (or null), use the max quantity
    // (they represent different charges on the same physical containers, not additional ones).
    // Lines with product chargeUnit === 'container' also create containers even without a type.
    const UNTYPED = '__untyped__'
    const containerDemands = new Map<string, number>()
    for (const line of enabledLines) {
      const product = line.productId ? productMap.get(line.productId) : null
      const chargeUnit = (product as any)?.chargeUnit || null
      const key = line.containerType || (chargeUnit === 'container' ? UNTYPED : null)
      if (key) {
        const qty = lineUnits[line.id] ?? 1
        const current = containerDemands.get(key) ?? 0
        containerDemands.set(key, Math.max(current, qty))
      }
    }

    for (const [key, count] of containerDemands) {
      for (let j = 0; j < count; j++) {
        const container = em.create(FmsSeaContainer, {
          organizationId: offer.organizationId,
          tenantId: tenantId,
          project,
          containerType: key === UNTYPED ? null : key as ContainerType,
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

    // Update project container count
    if (createdContainers.length > 0) {
      project.containerCount = createdContainers.length
    }

    // Update offer status to 'accepted'
    offer.status = 'accepted'
    offer.updatedAt = now

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

    return {
      projectId: project.id,
      projectNumber: project.projectNumber,
      offerId: offer.id,
      containerIds: createdContainers.map(c => c.id),
    }
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_offers.audit.offers.convert_to_project', 'Convert offer to project'),
      resourceKind: 'fms_offers.offer',
      resourceId: result.offerId,
      payload: {
        undo: {
          projectId: result.projectId,
          offerId: result.offerId,
          containerIds: result.containerIds,
          previousOfferStatus: 'sent',
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
  },
}

registerCommand(convertOfferToProjectCommand)
