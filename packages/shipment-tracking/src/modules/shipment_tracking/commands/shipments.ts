import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/core'
import type { EventBus } from '@open-mercato/events'
import { Shipment } from '../data/entities'
import type { ShipmentCreateInput, ShipmentUpdateInput } from '../data/validators'

function ensureScope(ctx: CommandRuntimeContext, tenantId: string, organizationId: string) {
  if (ctx.auth?.tenantId && ctx.auth.tenantId !== tenantId) {
    throw new Error('Tenant mismatch')
  }
  if (!ctx.auth?.isSuperAdmin && ctx.auth?.organizationId && ctx.auth.organizationId !== organizationId) {
    throw new Error('Organization mismatch')
  }
}

const createShipment: CommandHandler<ShipmentCreateInput, { id: string }> = {
  id: 'shipment_tracking.shipment.create',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()
    const eventBus = ctx.container.resolve<EventBus>('eventBus')

    const shipment = em.create(Shipment, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      carrierCode: input.carrierCode ?? null,
      containerNumber: input.containerNumber ?? null,
      bookingNumber: input.bookingNumber ?? null,
      bolNumber: input.bolNumber ?? null,
      etd: input.etd ?? null,
      etdOffset: input.etdOffset ?? null,
      eta: input.eta ?? null,
      etaOffset: input.etaOffset ?? null,
      originName: input.originName ?? null,
      originUnlocode: input.originUnlocode ?? null,
      originCountry: input.originCountry ?? null,
      destinationName: input.destinationName ?? null,
      destinationUnlocode: input.destinationUnlocode ?? null,
      destinationCountry: input.destinationCountry ?? null,
      vesselName: input.vesselName ?? null,
      vesselImo: input.vesselImo ?? null,
      extra: input.extra ?? null,
      createdByUserId: ctx.auth?.userId ?? null,
    })

    await em.flush()

    await eventBus.emit('shipment_tracking.shipment.created', {
      id: shipment.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    })

    return { id: shipment.id }
  },

  buildLog({ result, input }) {
    return {
      actionLabel: 'Create shipment',
      resourceKind: 'shipment_tracking.shipment',
      resourceId: result.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
    }
  },

  async undo({ logEntry, ctx }) {
    const shipmentId = logEntry?.resourceId
    if (!shipmentId) return
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const shipment = await em.findOne(Shipment, { id: shipmentId, deletedAt: null })
    if (!shipment) return
    shipment.deletedAt = new Date()
    await em.flush()
  },
}

const updateShipment: CommandHandler<ShipmentUpdateInput, { id: string }> = {
  id: 'shipment_tracking.shipment.update',

  async execute(input, ctx) {
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const eventBus = ctx.container.resolve<EventBus>('eventBus')

    const shipment = await em.findOne(Shipment, { id: input.id, deletedAt: null })
    if (!shipment) throw new Error('Shipment not found')

    ensureScope(ctx, shipment.tenantId, shipment.organizationId)

    const previousStatus = shipment.status

    if (input.carrierCode !== undefined) shipment.carrierCode = input.carrierCode
    if (input.containerNumber !== undefined) shipment.containerNumber = input.containerNumber
    if (input.bookingNumber !== undefined) shipment.bookingNumber = input.bookingNumber
    if (input.bolNumber !== undefined) shipment.bolNumber = input.bolNumber
    if (input.status !== undefined) shipment.status = input.status
    if (input.etd !== undefined) shipment.etd = input.etd
    if (input.etdOffset !== undefined) shipment.etdOffset = input.etdOffset
    if (input.eta !== undefined) shipment.eta = input.eta
    if (input.etaOffset !== undefined) shipment.etaOffset = input.etaOffset
    if (input.atd !== undefined) shipment.atd = input.atd
    if (input.atdOffset !== undefined) shipment.atdOffset = input.atdOffset
    if (input.ata !== undefined) shipment.ata = input.ata
    if (input.ataOffset !== undefined) shipment.ataOffset = input.ataOffset
    if (input.originName !== undefined) shipment.originName = input.originName
    if (input.originUnlocode !== undefined) shipment.originUnlocode = input.originUnlocode
    if (input.originCountry !== undefined) shipment.originCountry = input.originCountry
    if (input.destinationName !== undefined) shipment.destinationName = input.destinationName
    if (input.destinationUnlocode !== undefined) shipment.destinationUnlocode = input.destinationUnlocode
    if (input.destinationCountry !== undefined) shipment.destinationCountry = input.destinationCountry
    if (input.vesselName !== undefined) shipment.vesselName = input.vesselName
    if (input.vesselImo !== undefined) shipment.vesselImo = input.vesselImo
    if (input.extra !== undefined) shipment.extra = input.extra

    await em.flush()

    await eventBus.emit('shipment_tracking.shipment.updated', {
      id: shipment.id,
      tenantId: shipment.tenantId,
      organizationId: shipment.organizationId,
    })

    if (input.status && previousStatus !== input.status) {
      await eventBus.emit('shipment_tracking.shipment.status_changed', {
        id: shipment.id,
        previousStatus,
        newStatus: input.status,
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })
    }

    return { id: shipment.id }
  },
}

const deleteShipment: CommandHandler<{ id: string; tenantId: string; organizationId: string }, { id: string }> = {
  id: 'shipment_tracking.shipment.delete',

  async execute(input, ctx) {
    ensureScope(ctx, input.tenantId, input.organizationId)

    const em = ctx.container.resolve<EntityManager>('em').fork()
    const eventBus = ctx.container.resolve<EventBus>('eventBus')

    const shipment = await em.findOne(Shipment, { id: input.id, deletedAt: null })
    if (!shipment) throw new Error('Shipment not found')

    shipment.deletedAt = new Date()
    await em.flush()

    await eventBus.emit('shipment_tracking.shipment.deleted', {
      id: shipment.id,
      tenantId: shipment.tenantId,
      organizationId: shipment.organizationId,
    })

    return { id: shipment.id }
  },
}

registerCommand(createShipment)
registerCommand(updateShipment)
registerCommand(deleteShipment)
