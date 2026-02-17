import type { EntityManager } from '@mikro-orm/postgresql'
import type { EventBus } from '@open-mercato/events'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Shipment, TrackingJob, TrackingEvent, CarrierConfig } from '../data/entities'
import type { TrackingReferenceType, ShipmentStatusEnum } from '../data/entities'
import type { CarrierRegistryService } from './carrierRegistry'
import type { WebhookService } from './webhookService'
import type { CacheService } from '../lib/rate-limiter'
import { checkRateLimit } from '../lib/rate-limiter'
import { deriveShipmentStatus } from '../lib/status-machine'
import { extractShipmentTimes } from '../lib/time-extraction'
import { generatePollSchedule, getNextPollDate } from '../lib/schedule-generator'
import type { CarrierFetchedEvent } from '../lib/carrier-adapter'
import { mapDcsaEventToWebhookType, isSignificantMilestone } from '../lib/dcsa-event-mapping'

type TrackingServiceDeps = {
  em: () => EntityManager
  eventBus: EventBus
  carrierRegistry: CarrierRegistryService
  cacheService: CacheService
  webhookService: WebhookService
}

export class TrackingService {
  private deps: TrackingServiceDeps

  constructor(deps: TrackingServiceDeps) {
    this.deps = deps
  }

  /**
   * Creates a tracking job and immediately polls the carrier.
   * This is the main entry point for new tracking requests.
   * 
   * The system will:
   * 1. Create a TrackingJob for the given carrier and reference
   * 2. Poll the carrier API for events
   * 3. Auto-discover containers from EQUIPMENT events and create Shipments
   * 4. Emit events for new cargo events and shipment status changes
   */
  async createTrackingJob(input: {
    organizationId: string
    tenantId: string
    carrierCode: string
    referenceType: TrackingReferenceType
    referenceValue: string
    schedule?: string[]
  }): Promise<{
    trackingJobId: string
    shipmentsCreated: number
    newEvents: number
  }> {
    const em = this.deps.em()
    const { organizationId, tenantId, carrierCode, referenceType, referenceValue, schedule } = input

    const carrierCodeLower = carrierCode.toLowerCase()

    // Check if carrier adapter exists
    if (!this.deps.carrierRegistry.has(carrierCodeLower)) {
      throw new Error(`No adapter registered for carrier: ${carrierCode}`)
    }

    // Check for existing active job with same reference
    const existingJob = await em.findOne(TrackingJob, {
      organizationId,
      tenantId,
      carrierCode: carrierCodeLower,
      referenceType,
      referenceValue,
      status: { $in: ['active', 'paused'] },
      deletedAt: null,
    })

    if (existingJob) {
      console.debug('[shipment-tracking] TrackingJob already exists:', existingJob.id)
      // Poll the existing job
      const pollResult = await this.pollTrackingJob(existingJob.id)
      return {
        trackingJobId: existingJob.id,
        shipmentsCreated: pollResult.shipmentsCreated,
        newEvents: pollResult.newEvents,
      }
    }

    // Generate poll schedule
    const pollSchedule = schedule ?? generatePollSchedule({})
    const nextPollAt = getNextPollDate(pollSchedule)

    // Create new tracking job
    const trackingJob = em.create(TrackingJob, {
      organizationId,
      tenantId,
      carrierCode: carrierCodeLower,
      referenceType,
      referenceValue,
      status: 'active',
      schedule: pollSchedule,
      nextPollAt,
    })

    em.persist(trackingJob)
    await em.flush()

    console.log('[shipment-tracking] Created TrackingJob:', {
      jobId: trackingJob.id,
      carrier: carrierCodeLower,
      ref: `${referenceType}:${referenceValue}`,
    })

    // Emit tracking job created event
    await this.deps.eventBus.emit('shipment_tracking.tracking_job.created', {
      id: trackingJob.id,
      carrierCode: carrierCodeLower,
      referenceType,
      referenceValue,
      tenantId,
      organizationId,
    })

    // Poll immediately
    let pollResult = { shipmentsCreated: 0, newEvents: 0 }
    try {
      pollResult = await this.pollTrackingJob(trackingJob.id)
    } catch (error) {
      console.error('[shipment-tracking] Initial poll failed:', error)

      await this.deps.eventBus.emit('shipment_tracking.tracking_job.poll_failed', {
        id: trackingJob.id,
        carrierCode: carrierCodeLower,
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId,
        organizationId,
      })
    }

    return {
      trackingJobId: trackingJob.id,
      shipmentsCreated: pollResult.shipmentsCreated,
      newEvents: pollResult.newEvents,
    }
  }

  /**
   * Polls all active tracking jobs for a tenant/organization.
   * Called by the scheduler for periodic re-polling.
   */
  async pollAllActiveJobs(
    tenantId: string,
    organizationId?: string,
  ): Promise<{ polled: number; newEvents: number; failed: number }> {
    const em = this.deps.em()

    const filter: Record<string, unknown> = {
      tenantId,
      status: 'active',
      deletedAt: null,
    }

    if (organizationId) {
      filter.organizationId = organizationId
    }

    const jobs = await em.find(TrackingJob, filter)

    let polled = 0
    let totalNewEvents = 0
    let failed = 0

    for (const job of jobs) {
      try {
        const result = await this.pollTrackingJob(job.id)
        polled++
        totalNewEvents += result.newEvents
      } catch (error) {
        failed++
        console.error(`[shipment-tracking] Poll failed for job ${job.id}:`, error)

        await this.deps.eventBus.emit('shipment_tracking.tracking_job.poll_failed', {
          id: job.id,
          carrierCode: job.carrierCode,
          error: error instanceof Error ? error.message : 'Unknown error',
          tenantId: job.tenantId,
          organizationId: job.organizationId,
        })
      }
    }

    console.log('[shipment-tracking] Poll all completed:', { polled, totalNewEvents, failed })

    return { polled, newEvents: totalNewEvents, failed }
  }

  /**
   * Polls a single tracking job:
   * 1. Fetches events from the carrier
   * 2. Persists new TrackingEvents
   * 3. Auto-discovers containers and creates/updates Shipments
   * 4. Emits events for cargo events and shipment changes
   */
  async pollTrackingJob(jobId: string): Promise<{
    newEvents: number
    shipmentsCreated: number
    shipmentsUpdated: number
  }> {
    const em = this.deps.em()
    const job = await em.findOne(TrackingJob, { id: jobId }, { populate: ['shipments'] })

    if (!job) {
      throw new Error(`TrackingJob not found: ${jobId}`)
    }

    if (job.status !== 'active') {
      return { newEvents: 0, shipmentsCreated: 0, shipmentsUpdated: 0 }
    }

    // Resolve carrier adapter
    const adapter = this.deps.carrierRegistry.get(job.carrierCode)
    if (!adapter) {
      await this.recordJobError(em, job, `No adapter registered for carrier: ${job.carrierCode}`)
      return { newEvents: 0, shipmentsCreated: 0, shipmentsUpdated: 0 }
    }

    // Load carrier config for rate limiting and auth
    const scope = { tenantId: job.tenantId, organizationId: job.organizationId }
    const carrierConfig = await findOneWithDecryption(
      em,
      CarrierConfig,
      {
        carrierCode: job.carrierCode,
        organizationId: job.organizationId,
        tenantId: job.tenantId,
        isActive: true,
      },
      undefined,
      scope,
    )

    // Check rate limit
    if (carrierConfig) {
      const limitResult = await checkRateLimit(
        this.deps.cacheService,
        job.tenantId,
        job.carrierCode,
        carrierConfig.rateLimitRequests,
        carrierConfig.rateLimitWindowSeconds,
      )

      if (!limitResult.allowed) {
        console.debug(
          `[shipment-tracking] Rate limited for ${job.carrierCode}, retry after ${limitResult.retryAfterSeconds}s`,
        )
        return { newEvents: 0, shipmentsCreated: 0, shipmentsUpdated: 0 }
      }
    }

    // Fetch events from carrier
    let fetchedEvents: CarrierFetchedEvent[]
    let carrierResult: { vesselName?: string | null; vesselImo?: string | null; bookingNumber?: string | null }
    try {
      const result = await adapter.fetchEvents({
        referenceType: job.referenceType,
        referenceValue: job.referenceValue,
        apiEndpoint: carrierConfig?.apiEndpoint,
        authConfig: carrierConfig?.authConfig,
      })
      fetchedEvents = result.events
      carrierResult = {
        vesselName: result.vesselName,
        vesselImo: result.vesselImo,
        bookingNumber: result.bookingNumber,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error'
      await this.recordJobError(em, job, message)
      return { newEvents: 0, shipmentsCreated: 0, shipmentsUpdated: 0 }
    }

    // Persist new events (deduplicate by source + sourceEventId)
    const existingSourceEventIds = new Set(
      (
        await em.find(TrackingEvent, {
          trackingJob: job,
          sourceEventId: { $in: fetchedEvents.map((e) => e.sourceEventId) },
        })
      ).map((e) => `${e.source}:${e.sourceEventId}`),
    )

    const newEvents: TrackingEvent[] = []
    for (const fetched of fetchedEvents) {
      const dedupeKey = `${fetched.source}:${fetched.sourceEventId}`
      if (existingSourceEventIds.has(dedupeKey)) continue

      const trackingEvent = em.create(TrackingEvent, {
        organizationId: job.organizationId,
        tenantId: job.tenantId,
        trackingJob: job,

        // Source identification
        source: fetched.source,
        sourceEventId: fetched.sourceEventId,

        // Core event fields
        eventType: fetched.eventType,
        eventCode: fetched.eventCode,
        eventClassifierCode: fetched.eventClassifierCode,
        eventDateTime: fetched.eventDateTime,
        eventDateTimeOffset: fetched.eventDateTimeOffset,
        description: fetched.description,
        rawData: fetched.rawData,

        // Equipment fields
        equipmentReference: fetched.equipmentReference,
        isoEquipmentCode: fetched.isoEquipmentCode,
        emptyIndicatorCode: fetched.emptyIndicatorCode,
        isTransshipmentMove: fetched.isTransshipmentMove,

        // Location fields
        locationName: fetched.locationName,
        locationUnlocode: fetched.locationUnlocode,
        locationCountry: fetched.locationCountry,
        facilityCode: fetched.facilityCode,
        facilityCodeListProvider: fetched.facilityCodeListProvider,
        facilityTypeCode: fetched.facilityTypeCode,
        latitude: fetched.latitude,
        longitude: fetched.longitude,

        // Transport call fields
        transportCallReference: fetched.transportCallReference,
        modeOfTransport: fetched.modeOfTransport,
        vesselName: fetched.vesselName,
        vesselImo: fetched.vesselImo,
        voyageNumber: fetched.voyageNumber,
        carrierServiceCode: fetched.carrierServiceCode,
        carrierExportVoyageNumber: fetched.carrierExportVoyageNumber,
        carrierImportVoyageNumber: fetched.carrierImportVoyageNumber,
        universalServiceReference: fetched.universalServiceReference,
        universalExportVoyageReference: fetched.universalExportVoyageReference,
        universalImportVoyageReference: fetched.universalImportVoyageReference,
        portVisitReference: fetched.portVisitReference,

        // Document references
        relatedDocumentReferences: fetched.relatedDocumentReferences,

        // Metadata fields
        eventCreatedDateTime: fetched.eventCreatedDateTime,
        retractedEventId: fetched.retractedEventId,
        publisherName: fetched.publisherName,
        publisherRole: fetched.publisherRole,

        // Additional fields
        delayReasonCode: fetched.delayReasonCode,
        changeRemark: fetched.changeRemark,
        seals: fetched.seals,
      })
      newEvents.push(trackingEvent)
      existingSourceEventIds.add(dedupeKey) // Prevent duplicates within same batch
    }

    if (newEvents.length === 0) {
      // Update poll tracking even if no new events
      job.lastPollAt = new Date()
      job.retryCount = 0
      await em.flush()
      return { newEvents: 0, shipmentsCreated: 0, shipmentsUpdated: 0 }
    }

    // Persist new events
    await em.flush()

    // Auto-discover containers and create/update Shipments
    const { shipmentsCreated, shipmentsUpdated } = await this.syncShipmentsFromEvents(
      em,
      job,
      carrierResult,
    )

    // Update job
    job.lastPollAt = new Date()
    job.retryCount = 0
    await em.flush()

    // Emit events for each new tracking event
    for (const event of newEvents) {
      await this.emitTrackingEventCreated(event, job)
    }

    return { newEvents: newEvents.length, shipmentsCreated, shipmentsUpdated }
  }

  /**
   * Syncs Shipments based on TrackingEvents for a job.
   * Auto-discovers containers from equipmentReference in EQUIPMENT events.
   * For container-based tracking (referenceType='container'), creates exactly one Shipment.
   * For booking/BOL tracking, creates one Shipment per unique equipmentReference.
   */
  private async syncShipmentsFromEvents(
    em: EntityManager,
    job: TrackingJob,
    carrierResult: { vesselName?: string | null; vesselImo?: string | null; bookingNumber?: string | null },
  ): Promise<{ shipmentsCreated: number; shipmentsUpdated: number }> {
    // Get all events for this job
    const allEvents = await em.find(
      TrackingEvent,
      { trackingJob: job },
      { orderBy: { eventDateTime: 'asc' } },
    )

    if (allEvents.length === 0) {
      return { shipmentsCreated: 0, shipmentsUpdated: 0 }
    }

    // Extract unique container numbers (equipmentReferences) from EQUIPMENT events
    const containerNumbers = new Set<string>()
    for (const event of allEvents) {
      if (event.eventType === 'EQUIPMENT' && event.equipmentReference) {
        containerNumbers.add(event.equipmentReference)
      }
    }

    // For container-based tracking with no equipment events yet, use the reference value
    if (containerNumbers.size === 0 && job.referenceType === 'container') {
      containerNumbers.add(job.referenceValue)
    }

    // If still no containers found, nothing to do yet
    if (containerNumbers.size === 0) {
      return { shipmentsCreated: 0, shipmentsUpdated: 0 }
    }

    // Load existing shipments for this job
    const existingShipments = await em.find(Shipment, {
      trackingJob: job,
      deletedAt: null,
    })
    const shipmentsByContainer = new Map(
      existingShipments.map((s) => [s.containerNumber, s]),
    )

    let shipmentsCreated = 0
    let shipmentsUpdated = 0

    // Track shipments that need events emitted after flush
    const newShipments: Array<{ shipment: Shipment; containerNumber: string }> = []
    const statusChanges: Array<{
      shipment: Shipment
      previousStatus: string
      newStatus: string
    }> = []

    // Create or update shipments for each container
    for (const containerNumber of containerNumbers) {
      let shipment = shipmentsByContainer.get(containerNumber)
      const isNew = !shipment

      if (!shipment) {
        // Create new shipment
        shipment = em.create(Shipment, {
          organizationId: job.organizationId,
          tenantId: job.tenantId,
          trackingJob: job,
          carrierCode: job.carrierCode,
          containerNumber,
          bookingNumber: job.referenceType === 'booking' ? job.referenceValue : carrierResult.bookingNumber,
          bolNumber: job.referenceType === 'bol' ? job.referenceValue : undefined,
          status: 'PENDING',
        })
        em.persist(shipment)
        shipmentsByContainer.set(containerNumber, shipment)
        shipmentsCreated++
        newShipments.push({ shipment, containerNumber })

        console.log('[shipment-tracking] Auto-created Shipment:', {
          shipmentId: shipment.id,
          containerNumber,
          jobId: job.id,
        })
      }

      // Update shipment state from events
      const result = await this.deriveShipmentStateFromEvents(em, shipment, allEvents)
      if (result.changed) {
        shipmentsUpdated++
        if (result.statusChange) {
          statusChanges.push({
            shipment,
            previousStatus: result.statusChange.previousStatus,
            newStatus: result.statusChange.newStatus,
          })
        }
      }
    }

    // Flush all changes to database BEFORE emitting events
    await em.flush()

    // Now emit events - shipments are committed and can be fetched by subscribers
    for (const { shipment, containerNumber } of newShipments) {
      await this.deps.eventBus.emit('shipment_tracking.shipment.created', {
        id: shipment.id,
        containerNumber,
        trackingJobId: job.id,
        tenantId: job.tenantId,
        organizationId: job.organizationId,
      })
    }

    for (const { shipment, previousStatus, newStatus } of statusChanges) {
      await this.deps.eventBus.emit('shipment_tracking.shipment.status_changed', {
        id: shipment.id,
        previousStatus,
        newStatus,
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })

      // Emit specific lifecycle events
      if (newStatus === 'BOOKED' && previousStatus === 'PENDING') {
        await this.deps.eventBus.emit('shipment_tracking.shipment.booked', {
          id: shipment.id,
          tenantId: shipment.tenantId,
          organizationId: shipment.organizationId,
        })
      }

      if (newStatus === 'DELIVERED') {
        await this.deps.eventBus.emit('shipment_tracking.shipment.delivered', {
          id: shipment.id,
          tenantId: shipment.tenantId,
          organizationId: shipment.organizationId,
        })
      }

      await this.deps.eventBus.emit('shipment_tracking.shipment.updated', {
        id: shipment.id,
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })
    }

    return { shipmentsCreated, shipmentsUpdated }
  }

  /**
   * Derives and updates Shipment state from TrackingEvents.
   * Filters events by equipmentReference to get container-specific events.
   * TRANSPORT events (no equipmentReference) apply to all containers.
   * 
   * Returns status change info if status changed, so caller can emit events after flush.
   */
  private async deriveShipmentStateFromEvents(
    em: EntityManager,
    shipment: Shipment,
    allEvents: TrackingEvent[],
  ): Promise<{ changed: boolean; statusChange?: { previousStatus: string; newStatus: string } }> {
    // Filter events for this specific container
    // Include EQUIPMENT events with matching equipmentReference
    // Include TRANSPORT events (they apply to all containers)
    const containerEvents = allEvents.filter((event) => {
      if (event.eventType === 'TRANSPORT') return true
      if (event.eventType === 'EQUIPMENT') {
        return event.equipmentReference === shipment.containerNumber
      }
      return false
    })

    if (containerEvents.length === 0) {
      return { changed: false }
    }

    const context = {
      originUnlocode: shipment.originUnlocode,
      destinationUnlocode: shipment.destinationUnlocode,
    }

    // Derive status
    const previousStatus = shipment.status
    const newStatus = deriveShipmentStatus(
      containerEvents.map((event) => ({
        eventCode: event.eventCode,
        eventClassifierCode: event.eventClassifierCode,
        locationUnlocode: event.locationUnlocode,
      })),
      context,
      shipment.status,
    )

    // Extract times
    const times = extractShipmentTimes(
      containerEvents.map((event) => ({
        eventCode: event.eventCode,
        eventClassifierCode: event.eventClassifierCode,
        eventDateTime: event.eventDateTime,
        eventDateTimeOffset: event.eventDateTimeOffset,
        locationUnlocode: event.locationUnlocode,
      })),
      context,
    )

    // Get latest event for current location
    const latestEvent = containerEvents[containerEvents.length - 1]

    // Check if anything changed
    const changed =
      previousStatus !== newStatus ||
      shipment.etd !== times.etd ||
      shipment.eta !== times.eta ||
      shipment.atd !== times.atd ||
      shipment.ata !== times.ata ||
      shipment.vesselName !== latestEvent?.vesselName ||
      shipment.currentLocationName !== latestEvent?.locationName

    if (!changed) {
      return { changed: false }
    }

    // Update shipment
    shipment.status = newStatus as ShipmentStatusEnum

    if (times.etd) {
      shipment.etd = times.etd
      shipment.etdOffset = times.etdOffset ?? null
    }
    if (times.eta) {
      shipment.eta = times.eta
      shipment.etaOffset = times.etaOffset ?? null
    }
    if (times.atd) {
      shipment.atd = times.atd
      shipment.atdOffset = times.atdOffset ?? null
    }
    if (times.ata) {
      shipment.ata = times.ata
      shipment.ataOffset = times.ataOffset ?? null
    }

    // Update current location from latest event
    if (latestEvent) {
      shipment.currentLocationName = latestEvent.locationName
      shipment.currentLocationUnlocode = latestEvent.locationUnlocode
      shipment.vesselName = latestEvent.vesselName ?? shipment.vesselName
      shipment.vesselImo = latestEvent.vesselImo ?? shipment.vesselImo
      shipment.voyageNumber = latestEvent.voyageNumber ?? shipment.voyageNumber
      shipment.lastEventAt = latestEvent.eventDateTime
    }

    shipment.eventCount = containerEvents.length

    // Return status change info so caller can emit events after flush
    const statusChange = previousStatus !== newStatus
      ? { previousStatus, newStatus }
      : undefined

    return { changed: true, statusChange }
  }

  /**
   * Emits events for a newly created TrackingEvent.
   */
  private async emitTrackingEventCreated(
    event: TrackingEvent,
    job: TrackingJob,
  ): Promise<void> {
    const eventPayload = {
      id: event.id,
      trackingJobId: job.id,
      tenantId: event.tenantId,
      organizationId: event.organizationId,

      // Source
      source: event.source,
      sourceEventId: event.sourceEventId,

      // Core event fields
      eventType: event.eventType,
      eventCode: event.eventCode,
      eventClassifierCode: event.eventClassifierCode,
      eventDateTime: event.eventDateTime?.toISOString(),
      description: event.description,

      // Equipment fields
      equipmentReference: event.equipmentReference,
      isoEquipmentCode: event.isoEquipmentCode,
      emptyIndicatorCode: event.emptyIndicatorCode,
      isTransshipmentMove: event.isTransshipmentMove,

      // Location fields
      locationName: event.locationName,
      locationUnlocode: event.locationUnlocode,
      locationCountry: event.locationCountry,
      facilityCode: event.facilityCode,
      facilityTypeCode: event.facilityTypeCode,

      // Transport call fields
      vesselName: event.vesselName,
      vesselImo: event.vesselImo,
      voyageNumber: event.voyageNumber,
      carrierServiceCode: event.carrierServiceCode,
      modeOfTransport: event.modeOfTransport,

      // Document references
      relatedDocumentReferences: event.relatedDocumentReferences,

      // Metadata
      publisherName: event.publisherName,
      publisherRole: event.publisherRole,
    }

    // Always emit generic event for backward compatibility
    await this.deps.eventBus.emit('shipment_tracking.tracking_event.created', eventPayload)

    // Emit granular DCSA-compliant event if significant milestone
    if (isSignificantMilestone({
      eventType: event.eventType,
      eventCode: event.eventCode,
      eventClassifierCode: event.eventClassifierCode,
    })) {
      const dcsaEventType = mapDcsaEventToWebhookType({
        eventType: event.eventType,
        eventCode: event.eventCode,
        eventClassifierCode: event.eventClassifierCode,
      })

      await this.deps.eventBus.emit(dcsaEventType, eventPayload)
    }
  }

  /**
   * Records an error on a tracking job.
   */
  private async recordJobError(
    em: EntityManager,
    job: TrackingJob,
    message: string,
  ): Promise<void> {
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
        carrierCode: job.carrierCode,
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
