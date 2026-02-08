import type { EntityManager } from '@mikro-orm/core'
import type { EventBus } from '@open-mercato/events'
import { Shipment, TrackingJob } from '../data/entities'
import type { TrackingReferenceType } from '../data/entities'
import type { CarrierRegistryService } from '../services/carrierRegistry'
import { generatePollSchedule, getNextPollDate } from '../lib/schedule-generator'

export const metadata = {
  event: 'shipment_tracking.shipment.created',
  persistent: true,
  id: 'shipment_tracking:shipment-created-auto-track',
}

type ShipmentCreatedPayload = {
  id: string
  tenantId: string
  organizationId: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

function determineReference(shipment: Shipment): { type: TrackingReferenceType; value: string } | null {
  if (shipment.containerNumber) return { type: 'container', value: shipment.containerNumber }
  if (shipment.bookingNumber) return { type: 'booking', value: shipment.bookingNumber }
  if (shipment.bolNumber) return { type: 'bol', value: shipment.bolNumber }
  return null
}

export default async function handle(payload: ShipmentCreatedPayload, ctx: ResolverContext) {
  const emFactory = ctx.resolve<() => EntityManager>('em')
  const em = typeof emFactory === 'function' ? emFactory() : emFactory as unknown as EntityManager
  const eventBus = ctx.resolve<EventBus>('eventBus')
  const carrierRegistry = ctx.resolve<CarrierRegistryService>('shipmentTrackingCarrierRegistry')

  try {
    const shipment = await em.findOne(Shipment, { id: payload.id })

    if (!shipment) {
      console.warn('[shipment-tracking:auto-track] Shipment not found:', payload.id)
      return
    }

    if (!shipment.carrierCode) {
      console.debug('[shipment-tracking:auto-track] No carrier code, skipping:', payload.id)
      return
    }

    const carrierName = shipment.carrierCode.toLowerCase()

    if (!carrierRegistry.has(carrierName)) {
      console.warn('[shipment-tracking:auto-track] Unknown carrier, skipping:', carrierName)
      return
    }

    const ref = determineReference(shipment)
    if (!ref) {
      console.debug('[shipment-tracking:auto-track] No tracking reference (container/booking/bol), skipping:', payload.id)
      return
    }

    const existingJob = await em.findOne(TrackingJob, {
      shipment: { id: shipment.id },
      carrierName,
      referenceType: ref.type,
      referenceValue: ref.value,
      status: { $in: ['active', 'paused'] },
    })

    if (existingJob) {
      console.debug('[shipment-tracking:auto-track] TrackingJob already exists:', existingJob.id)
      return
    }

    const schedule = generatePollSchedule({
      etd: shipment.etd,
      eta: shipment.eta,
      atd: shipment.atd,
      ata: shipment.ata,
    })

    const nextPollAt = getNextPollDate(schedule)

    const trackingJob = em.create(TrackingJob, {
      organizationId: shipment.organizationId,
      tenantId: shipment.tenantId,
      shipment,
      carrierName,
      referenceType: ref.type,
      referenceValue: ref.value,
      status: 'active',
      schedule,
      nextPollAt,
    })

    em.persist(trackingJob)
    await em.flush()

    console.log('[shipment-tracking:auto-track] Created TrackingJob:', {
      jobId: trackingJob.id,
      shipmentId: shipment.id,
      carrier: carrierName,
      ref: `${ref.type}:${ref.value}`,
    })

    await eventBus.emit('shipment_tracking.tracking_job.created', {
      id: trackingJob.id,
      shipmentId: shipment.id,
      carrierName,
      tenantId: shipment.tenantId,
      organizationId: shipment.organizationId,
    })
  } catch (error) {
    console.error('[shipment-tracking:auto-track] Failed to auto-create tracking job:', error)
  }
}
