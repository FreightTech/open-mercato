import type { EntityManager } from '@mikro-orm/postgresql'
import type { EventBus } from '@open-mercato/events'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Shipment, TrackingJob, CargoEvent, CarrierConfig } from '../data/entities'
import type { CarrierRegistryService } from './carrierRegistry'
import type { CacheService } from '../lib/rate-limiter'
import { checkRateLimit } from '../lib/rate-limiter'
import { deriveShipmentStatus } from '../lib/status-machine'
import { extractShipmentTimes } from '../lib/time-extraction'
import type { CarrierFetchedEvent } from '../lib/carrier-adapter'

type TrackingServiceDeps = {
  em: () => EntityManager
  eventBus: EventBus
  carrierRegistry: CarrierRegistryService
  cacheService: CacheService
}

export class TrackingService {
  private deps: TrackingServiceDeps

  constructor(deps: TrackingServiceDeps) {
    this.deps = deps
  }

  /**
   * Polls a single tracking job: fetches events from the carrier,
   * persists new events, updates shipment status/times, and emits events.
   */
  async pollShipment(jobId: string): Promise<{ newEvents: number }> {
    const em = this.deps.em()
    const job = await em.findOne(TrackingJob, { id: jobId }, { populate: ['shipment'] })

    if (!job) {
      throw new Error(`TrackingJob not found: ${jobId}`)
    }

    if (job.status !== 'active') {
      return { newEvents: 0 }
    }

    const shipment = job.shipment

    // Resolve carrier adapter
    const adapter = this.deps.carrierRegistry.get(job.carrierName)
    if (!adapter) {
      await this.recordJobError(em, job, `No adapter registered for carrier: ${job.carrierName}`)
      return { newEvents: 0 }
    }

    // Load carrier config for rate limiting and auth (company-specific first, then default)
    const scope = { tenantId: shipment.tenantId, organizationId: shipment.organizationId }
    let carrierConfig = shipment.companyName
      ? await findOneWithDecryption(em, CarrierConfig, {
          carrierName: job.carrierName,
          organizationId: shipment.organizationId,
          tenantId: shipment.tenantId,
          companyName: shipment.companyName,
          isActive: true,
        }, undefined, scope)
      : null

    if (!carrierConfig) {
      carrierConfig = await findOneWithDecryption(em, CarrierConfig, {
        carrierName: job.carrierName,
        organizationId: shipment.organizationId,
        tenantId: shipment.tenantId,
        companyName: null,
        isActive: true,
      }, undefined, scope)
    }

    // Check rate limit
    if (carrierConfig) {
      const limitResult = await checkRateLimit(
        this.deps.cacheService,
        shipment.tenantId,
        job.carrierName,
        carrierConfig.rateLimitRequests,
        carrierConfig.rateLimitWindowSeconds,
      )

      if (!limitResult.allowed) {
        console.debug(`[shipment-tracking] Rate limited for ${job.carrierName}, retry after ${limitResult.retryAfterSeconds}s`)
        return { newEvents: 0 }
      }
    }

    // Fetch events from carrier
    let fetchedEvents: CarrierFetchedEvent[]
    try {
      const result = await adapter.fetchEvents({
        referenceType: job.referenceType,
        referenceValue: job.referenceValue,
        apiEndpoint: carrierConfig?.apiEndpoint,
        authConfig: carrierConfig?.authConfig,
      })
      fetchedEvents = result.events

      // Update shipment with any new reference numbers from carrier
      if (result.containerNumber && !shipment.containerNumber) {
        shipment.containerNumber = result.containerNumber
      }
      if (result.vesselName && !shipment.vesselName) {
        shipment.vesselName = result.vesselName
        shipment.vesselImo = result.vesselImo ?? shipment.vesselImo
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error'
      await this.recordJobError(em, job, message)
      return { newEvents: 0 }
    }

    // Persist new events (deduplicate by eventId)
    const existingEventIds = new Set(
      (await em.find(CargoEvent, { shipment, eventId: { $in: fetchedEvents.map((event) => event.eventId) } }))
        .map((event) => event.eventId),
    )

    const newEvents: CargoEvent[] = []
    for (const fetched of fetchedEvents) {
      if (existingEventIds.has(fetched.eventId)) continue

      const cargoEvent = em.create(CargoEvent, {
        organizationId: shipment.organizationId,
        tenantId: shipment.tenantId,
        shipment,
        eventId: fetched.eventId,
        eventType: fetched.eventType,
        eventCode: fetched.eventCode,
        eventClassification: fetched.eventClassification,
        eventDateTime: fetched.eventDateTime,
        eventDateTimeOffset: fetched.eventDateTimeOffset,
        description: fetched.description,
        locationName: fetched.locationName,
        locationUnlocode: fetched.locationUnlocode,
        locationCountry: fetched.locationCountry,
        vesselName: fetched.vesselName,
        vesselImo: fetched.vesselImo,
        voyageNumber: fetched.voyageNumber,
        rawData: fetched.rawData,
      })
      newEvents.push(cargoEvent)
    }

    if (newEvents.length === 0) {
      // Update poll tracking even if no new events
      job.lastPollAt = new Date()
      job.retryCount = 0
      await em.flush()
      return { newEvents: 0 }
    }

    // Update shipment event count
    shipment.eventCount = (shipment.eventCount || 0) + newEvents.length

    // Derive new status from all events
    const allEvents = await em.find(CargoEvent, { shipment }, { orderBy: { eventDateTime: 'asc' } })
    const context = {
      originUnlocode: shipment.originUnlocode,
      destinationUnlocode: shipment.destinationUnlocode,
    }

    const previousStatus = shipment.status
    const newStatus = deriveShipmentStatus(
      allEvents.map((event) => ({
        eventCode: event.eventCode,
        eventClassification: event.eventClassification,
        locationUnlocode: event.locationUnlocode,
      })),
      context,
      shipment.status,
    )

    shipment.status = newStatus

    // Extract times
    const times = extractShipmentTimes(
      allEvents.map((event) => ({
        eventCode: event.eventCode,
        eventClassification: event.eventClassification,
        eventDateTime: event.eventDateTime,
        eventDateTimeOffset: event.eventDateTimeOffset,
        locationUnlocode: event.locationUnlocode,
      })),
      context,
    )

    if (times.etd) { shipment.etd = times.etd; shipment.etdOffset = times.etdOffset ?? null }
    if (times.eta) { shipment.eta = times.eta; shipment.etaOffset = times.etaOffset ?? null }
    if (times.atd) { shipment.atd = times.atd; shipment.atdOffset = times.atdOffset ?? null }
    if (times.ata) { shipment.ata = times.ata; shipment.ataOffset = times.ataOffset ?? null }

    // Update job
    job.lastPollAt = new Date()
    job.retryCount = 0

    // If shipment delivered, deactivate job
    if (newStatus === 'DELIVERED') {
      job.status = 'deactivated'
    }

    await em.flush()

    // Emit events
    for (const cargoEvent of newEvents) {
      await this.deps.eventBus.emit('shipment_tracking.cargo_event.created', {
        id: cargoEvent.id,
        shipmentId: shipment.id,
        eventCode: cargoEvent.eventCode,
        eventType: cargoEvent.eventType,
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })
    }

    if (previousStatus !== newStatus) {
      await this.deps.eventBus.emit('shipment_tracking.shipment.status_changed', {
        id: shipment.id,
        previousStatus,
        newStatus,
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })
    }

    await this.deps.eventBus.emit('shipment_tracking.shipment.updated', {
      id: shipment.id,
      tenantId: shipment.tenantId,
      organizationId: shipment.organizationId,
    })

    return { newEvents: newEvents.length }
  }

  private async recordJobError(em: EntityManager, job: TrackingJob, message: string): Promise<void> {
    const history = job.errorHistory ?? []
    history.push({ date: new Date().toISOString(), message })

    // Keep last 20 errors
    if (history.length > 20) {
      history.splice(0, history.length - 20)
    }

    job.errorHistory = history
    job.retryCount = (job.retryCount || 0) + 1
    job.lastPollAt = new Date()

    // Mark as failed after 10 consecutive errors
    if (job.retryCount >= 10) {
      job.status = 'failed'
      await em.flush()

      await this.deps.eventBus.emit('shipment_tracking.tracking_job.failed', {
        id: job.id,
        shipmentId: job.shipment.id,
        carrierName: job.carrierName,
        retryCount: job.retryCount,
        lastError: message,
        tenantId: job.tenantId,
        organizationId: job.organizationId,
      })
      return
    }

    await em.flush()
  }
}
