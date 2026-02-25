import type { EntityManager } from '@mikro-orm/postgresql'
import type { EventBus } from '@open-mercato/events'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Shipment, TrackingJob, TrackingEvent, CarrierConfig, BicConfig } from '../data/entities'
import type { TrackingReferenceType, ShipmentStatusEnum, FacilityCodeListProvider } from '../data/entities'
import type { CarrierRegistryService } from './carrierRegistry'
import type { WebhookService } from './webhookService'
import type { CacheService } from '../lib/rate-limiter'
import { checkRateLimit } from '../lib/rate-limiter'
import { deriveShipmentStatus } from '../lib/status-machine'
import { extractShipmentTimes } from '../lib/time-extraction'
import { generatePollSchedule, getNextPollDate } from '../lib/schedule-generator'
import type { CarrierFetchedEvent } from '../lib/carrier-adapter'
import { mapDcsaEventToWebhookType, isSignificantMilestone } from '../lib/dcsa-event-mapping'
import { inferRouteFromEvents } from '../lib/route-inference'
import { mergeExtractedTimestamps, getPrimaryTimestampValue } from '../lib/timestamp-utils'
import { findLatestVesselInfo } from '../lib/vessel-extraction'
import { extractRouteFromEvents, mapTrackingEventToEntry } from '../lib/route-extraction'
import { buildLocationFromEvent, createBasicLocation, mergeLocationWithBicData, isLocationComplete } from '../lib/location-types'
import type { FacilityLocation } from '../lib/location-types'
import { BicApiClient, type BicFacility } from '../lib/bic-api-client'
import { applyLocationOverrideIfExists } from '../lib/location-overrides'

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
   * 4. Auto-infer origin/destination ports from events if not provided
   * 5. Emit events for new cargo events and shipment status changes
   */
  async createTrackingJob(input: {
    organizationId: string
    tenantId: string
    carrierCode: string
    referenceType: TrackingReferenceType
    referenceValue: string
    // Origin/destination are optional - will be auto-inferred from events if not provided
    originUnlocode?: string
    destinationUnlocode?: string
    schedule?: string[]
  }): Promise<{
    trackingJobId: string
    shipmentsCreated: number
    newEvents: number
  }> {
    const em = this.deps.em()
    const { organizationId, tenantId, carrierCode, referenceType, referenceValue, schedule } = input
    // Origin/destination may be provided or will be auto-inferred from events
    let originUnlocode = input.originUnlocode?.toUpperCase()
    let destinationUnlocode = input.destinationUnlocode?.toUpperCase()

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

    // Create new tracking job (origin/destination may be null, will be inferred from first poll)
    const trackingJob = em.create(TrackingJob, {
      organizationId,
      tenantId,
      carrierCode: carrierCodeLower,
      referenceType,
      referenceValue,
      originUnlocode: originUnlocode ?? null,
      destinationUnlocode: destinationUnlocode ?? null,
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

    // Auto-infer origin/destination from events if not already set
    if (fetchedEvents.length > 0 && (!job.originUnlocode || !job.destinationUnlocode)) {
      const inferred = inferRouteFromEvents(fetchedEvents)

      if (!job.originUnlocode && inferred.originUnlocode) {
        job.originUnlocode = inferred.originUnlocode
        console.log('[shipment-tracking] Auto-inferred origin:', {
          jobId: job.id,
          origin: inferred.originUnlocode,
          confidence: inferred.confidence.origin,
        })
      }

      if (!job.destinationUnlocode && inferred.destinationUnlocode) {
        job.destinationUnlocode = inferred.destinationUnlocode
        console.log('[shipment-tracking] Auto-inferred destination:', {
          jobId: job.id,
          destination: inferred.destinationUnlocode,
          confidence: inferred.confidence.destination,
        })
      }
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
        facilityAddress: fetched.facilityAddress,
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

    // Load BIC config for facility enrichment
    const bicConfig = await this.loadBicConfig(em, scope)

    // Auto-discover containers and create/update Shipments
    const { shipmentsCreated, shipmentsUpdated } = await this.syncShipmentsFromEvents(
      em,
      job,
      carrierResult,
      bicConfig,
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
    bicConfig: BicConfig | null,
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
    const etaChanges: Array<{
      shipment: Shipment
      previousEta: Date
      newEta: Date
    }> = []
    const etdChanges: Array<{
      shipment: Shipment
      previousEtd: Date
      newEtd: Date
    }> = []

    // Create or update shipments for each container
    for (const containerNumber of containerNumbers) {
      let shipment = shipmentsByContainer.get(containerNumber)

      if (!shipment) {
        // Create new shipment - inherit origin/destination from tracking job
        shipment = em.create(Shipment, {
          organizationId: job.organizationId,
          tenantId: job.tenantId,
          trackingJob: job,
          carrierCode: job.carrierCode,
          containerNumber,
          bookingNumber: job.referenceType === 'booking' ? job.referenceValue : carrierResult.bookingNumber,
          bolNumber: job.referenceType === 'bol' ? job.referenceValue : undefined,
          // Initialize with basic location from job's UN/LOCODE if available
          // Will be enriched with full facility data from events later
          originLocation: job.originUnlocode ? createBasicLocation(job.originUnlocode) : null,
          destinationLocation: job.destinationUnlocode ? createBasicLocation(job.destinationUnlocode) : null,
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
      const result = await this.deriveShipmentStateFromEvents(em, shipment, allEvents, bicConfig)
      if (result.changed) {
        shipmentsUpdated++
        if (result.statusChange) {
          statusChanges.push({
            shipment,
            previousStatus: result.statusChange.previousStatus,
            newStatus: result.statusChange.newStatus,
          })
        }
        if (result.etaChange) {
          etaChanges.push({
            shipment,
            previousEta: result.etaChange.previousEta,
            newEta: result.etaChange.newEta,
          })
        }
        if (result.etdChange) {
          etdChanges.push({
            shipment,
            previousEtd: result.etdChange.previousEtd,
            newEtd: result.etdChange.newEtd,
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

      if (newStatus === 'PRE_ARRIVAL') {
        await this.deps.eventBus.emit('shipment_tracking.shipment.pre_arrival', {
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

    // Emit ETA change events
    for (const { shipment, previousEta, newEta } of etaChanges) {
      await this.deps.eventBus.emit('shipment_tracking.transport.eta_updated', {
        id: shipment.id,
        previousEta: previousEta.toISOString(),
        newEta: newEta.toISOString(),
        tenantId: shipment.tenantId,
        organizationId: shipment.organizationId,
      })
    }

    // Emit ETD change events
    for (const { shipment, previousEtd, newEtd } of etdChanges) {
      await this.deps.eventBus.emit('shipment_tracking.transport.etd_updated', {
        id: shipment.id,
        previousEtd: previousEtd.toISOString(),
        newEtd: newEtd.toISOString(),
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
   * Returns status change info and time changes so caller can emit events after flush.
   */
  private async deriveShipmentStateFromEvents(
    em: EntityManager,
    shipment: Shipment,
    allEvents: TrackingEvent[],
    bicConfig: BicConfig | null,
  ): Promise<{
    changed: boolean
    statusChange?: { previousStatus: string; newStatus: string }
    etaChange?: { previousEta: Date; newEta: Date }
    etdChange?: { previousEtd: Date; newEtd: Date }
  }> {
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

    // Get UN/LOCODEs from JSONB location objects
    const originUnlocode = shipment.originLocation?.unlocode ?? null
    const destinationUnlocode = shipment.destinationLocation?.unlocode ?? null
    
    const context = {
      originUnlocode,
      destinationUnlocode,
    }

    // Extract times from events first - needed for both status derivation and updates
    const times = extractShipmentTimes(
      containerEvents.map((event) => ({
        eventCode: event.eventCode,
        eventClassifierCode: event.eventClassifierCode,
        eventDateTime: event.eventDateTime,
        eventDateTimeOffset: event.eventDateTimeOffset,
        eventCreatedDateTime: event.eventCreatedDateTime,
        locationUnlocode: event.locationUnlocode,
      })),
      context,
    )

    // Get latest event for lastEventAt
    const latestEvent = containerEvents[containerEvents.length - 1]

    // Find latest event with vessel info (gate operations often don't have vessel data)
    const latestVesselInfo = findLatestVesselInfo(containerEvents)

    // Track previous primary timestamp values for change detection
    const previousEta = getPrimaryTimestampValue(shipment.etaTimestamps)
    const previousEtd = getPrimaryTimestampValue(shipment.etdTimestamps)
    const previousAtd = getPrimaryTimestampValue(shipment.atdTimestamps)
    const previousAta = getPrimaryTimestampValue(shipment.ataTimestamps)

    // Merge extracted timestamps into existing arrays (with deduplication)
    const mergedTimestamps = mergeExtractedTimestamps(
      {
        etdTimestamps: shipment.etdTimestamps,
        etaTimestamps: shipment.etaTimestamps,
        atdTimestamps: shipment.atdTimestamps,
        ataTimestamps: shipment.ataTimestamps,
      },
      times,
      'carrier_api',
      latestEvent?.sourceEventId,
    )

    // Get new primary values after merge
    const newEta = getPrimaryTimestampValue(mergedTimestamps.etaTimestamps)
    const newEtd = getPrimaryTimestampValue(mergedTimestamps.etdTimestamps)
    const newAtd = getPrimaryTimestampValue(mergedTimestamps.atdTimestamps)
    const newAta = getPrimaryTimestampValue(mergedTimestamps.ataTimestamps)

    // Derive status with time context for PRE_ARRIVAL evaluation
    const previousStatus = shipment.status
    const newStatus = deriveShipmentStatus(
      containerEvents.map((event) => ({
        eventCode: event.eventCode,
        eventClassifierCode: event.eventClassifierCode,
        locationUnlocode: event.locationUnlocode,
      })),
      context,
      shipment.status,
      { eta: newEta, ata: newAta },
    )

    // Check if ETA/ETD changed (compare timestamps, handle null)
    const etaChanged = newEta && previousEta && newEta.getTime() !== previousEta.getTime()
    const etdChanged = newEtd && previousEtd && newEtd.getTime() !== previousEtd.getTime()

    // Check if anything changed
    const changed =
      previousStatus !== newStatus ||
      mergedTimestamps.changed ||
      (newEtd && !previousEtd) || etdChanged ||
      (newEta && !previousEta) || etaChanged ||
      (newAtd && !previousAtd) || (newAtd && previousAtd && newAtd.getTime() !== previousAtd.getTime()) ||
      (newAta && !previousAta) || (newAta && previousAta && newAta.getTime() !== previousAta.getTime()) ||
      shipment.vesselName !== latestEvent?.vesselName

    if (!changed) {
      return { changed: false }
    }

    // Update shipment
    shipment.status = newStatus as ShipmentStatusEnum

    // Update timestamp arrays
    shipment.etdTimestamps = mergedTimestamps.etdTimestamps
    shipment.etaTimestamps = mergedTimestamps.etaTimestamps
    shipment.atdTimestamps = mergedTimestamps.atdTimestamps
    shipment.ataTimestamps = mergedTimestamps.ataTimestamps

    // Update vessel info from latest event with vessel data
    if (latestVesselInfo) {
      shipment.vesselName = latestVesselInfo.vesselName ?? shipment.vesselName
      shipment.vesselImo = latestVesselInfo.vesselImo ?? shipment.vesselImo
      shipment.voyageNumber = latestVesselInfo.voyageNumber ?? shipment.voyageNumber
    }

    // Extract ISO equipment code from the first EQUIPMENT event that has it
    if (!shipment.isoEquipmentCode) {
      const eventWithIsoCode = containerEvents.find(e => e.isoEquipmentCode)
      if (eventWithIsoCode) {
        shipment.isoEquipmentCode = eventWithIsoCode.isoEquipmentCode
      }
    }

    // Update lastEventAt from actual latest event
    if (latestEvent) {
      shipment.lastEventAt = latestEvent.eventDateTime
    }

    shipment.eventCount = containerEvents.length

    // ─── Denormalize cargo events and route stops ────────────────────
    // Map TrackingEvent entities to CargoEventEntry format for JSONB storage
    const cargoEvents = containerEvents.map(mapTrackingEventToEntry)
    shipment.cargoEvents = cargoEvents

    // Extract route stops from the mapped events
    shipment.routeStops = extractRouteFromEvents(cargoEvents, {
      originUnlocode,
      destinationUnlocode,
    })

    // ─── Build rich origin/destination locations ────────────────────
    // Find the best event for origin using priority:
    // 1. LOAD event at origin (actual loading at terminal)
    // 2. Any event at origin with facilityCode (terminal data available)
    // 3. Fallback: any event at origin location
    const originEventsAtLocation = containerEvents.filter(e => 
      e.locationUnlocode === originUnlocode
    )
    const originEvent = 
      // Priority 1: LOAD event at origin
      originEventsAtLocation.find(e => e.eventCode === 'LOAD' && e.eventClassifierCode === 'ACT') ??
      // Priority 2: Any event with facility code at origin
      originEventsAtLocation.find(e => e.facilityCode != null) ??
      // Fallback: First event at origin, or LOAD event anywhere if no origin specified
      originEventsAtLocation[0] ??
      (!originUnlocode ? containerEvents.find(e => e.eventCode === 'LOAD' && e.eventClassifierCode === 'ACT') : null)
    
    // Find the best event for destination using priority:
    // 1. DISC event at destination (actual discharge at terminal)
    // 2. Any event at destination with facilityCode (terminal data available)
    // 3. Fallback: last event at destination location
    const destEventsAtLocation = containerEvents.filter(e => 
      e.locationUnlocode === destinationUnlocode
    )
    const destEventsReversed = [...destEventsAtLocation].reverse()
    const destEvent = 
      // Priority 1: DISC event at destination (last one)
      destEventsReversed.find(e => e.eventCode === 'DISC' && e.eventClassifierCode === 'ACT') ??
      // Priority 2: Any event with facility code at destination (last one)
      destEventsReversed.find(e => e.facilityCode != null) ??
      // Fallback: Last event at destination, or DISC/ARRI event anywhere if no destination specified
      destEventsReversed[0] ??
      (!destinationUnlocode ? [...containerEvents].reverse().find(e => (e.eventCode === 'DISC' || e.eventCode === 'ARRI') && e.eventClassifierCode === 'ACT') : null)

    if (originEvent) {
      shipment.originLocation = buildLocationFromEvent({
        locationName: originEvent.locationName,
        locationUnlocode: originEvent.locationUnlocode,
        locationCountry: originEvent.locationCountry,
        facilityCode: originEvent.facilityCode,
        facilityCodeListProvider: originEvent.facilityCodeListProvider,
        facilityTypeCode: originEvent.facilityTypeCode,
        facilityAddress: originEvent.facilityAddress,
        latitude: originEvent.latitude,
        longitude: originEvent.longitude,
      })
    }

    if (destEvent) {
      shipment.destinationLocation = buildLocationFromEvent({
        locationName: destEvent.locationName,
        locationUnlocode: destEvent.locationUnlocode,
        locationCountry: destEvent.locationCountry,
        facilityCode: destEvent.facilityCode,
        facilityCodeListProvider: destEvent.facilityCodeListProvider,
        facilityTypeCode: destEvent.facilityTypeCode,
        facilityAddress: destEvent.facilityAddress,
        latitude: destEvent.latitude,
        longitude: destEvent.longitude,
      })
    }

    // ─── Enrich locations with BIC Facility API data ─────────────────
    // Only enrich if BIC config is enabled and locations are incomplete
    if (bicConfig) {
      await this.enrichShipmentLocationsWithBic(shipment, containerEvents, bicConfig)
    }

    // ─── Apply location overrides ─────────────────────────────────────
    // Overrides take priority over BIC data and allow correcting incorrect terminal info
    const scope = { organizationId: shipment.organizationId, tenantId: shipment.tenantId }
    const carrierCode = shipment.carrierCode?.toUpperCase() ?? null

    shipment.originLocation = await applyLocationOverrideIfExists(
      em, shipment.originLocation, carrierCode, scope
    )
    shipment.destinationLocation = await applyLocationOverrideIfExists(
      em, shipment.destinationLocation, carrierCode, scope
    )

    // Apply overrides to route stops
    if (shipment.routeStops) {
      for (const stop of shipment.routeStops) {
        if (stop.facilityCode && stop.facilityCodeListProvider) {
          const overridden = await applyLocationOverrideIfExists(em, {
            name: stop.location,
            unlocode: stop.unlocode ?? null,
            countryCode: stop.unlocode?.slice(0, 2) ?? null,
            facilityCode: stop.facilityCode,
            facilityCodeListProvider: stop.facilityCodeListProvider,
            facilityTypeCode: stop.facilityTypeCode ?? null,
            address: stop.facilityAddress ?? null,
            coords: stop.coords ?? null,
            operatorName: null,
            source: 'dcsa',
          }, carrierCode, scope)
          if (overridden && overridden.source === 'manual') {
            stop.location = overridden.name
            stop.facilityAddress = overridden.address
            stop.coords = overridden.coords
          }
        }
      }
    }

    // Return change info so caller can emit events after flush
    const statusChange = previousStatus !== newStatus
      ? { previousStatus, newStatus }
      : undefined

    // Only report ETA/ETD changes when the value actually changed (not initial set)
    const etaChange = etaChanged && previousEta && newEta
      ? { previousEta, newEta }
      : undefined

    const etdChange = etdChanged && previousEtd && newEtd
      ? { previousEtd, newEtd }
      : undefined

    return { changed: true, statusChange, etaChange, etdChange }
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
   * Loads BIC Facility API configuration for a tenant/organization.
   */
  private async loadBicConfig(
    em: EntityManager,
    scope: { tenantId: string; organizationId: string },
  ): Promise<BicConfig | null> {
    return findOneWithDecryption(
      em,
      BicConfig,
      {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        isEnabled: true,
      },
      undefined,
      scope,
    )
  }

  /**
   * Enriches shipment origin/destination locations and route stops with BIC Facility API data.
   * Only fetches data for facilities that are incomplete (missing coords or address).
   * One API call per unique facility code per poll.
   */
  private async enrichShipmentLocationsWithBic(
    shipment: Shipment,
    events: TrackingEvent[],
    bicConfig: BicConfig,
  ): Promise<void> {
    // Collect unique facility codes that need enrichment
    const facilitiesToEnrich = new Map<string, { code: string; provider: FacilityCodeListProvider; unlocode: string }>()

    // Check origin location
    if (shipment.originLocation && !isLocationComplete(shipment.originLocation) && shipment.originLocation.facilityCode) {
      const provider = shipment.originLocation.facilityCodeListProvider ?? 'SMDG'
      facilitiesToEnrich.set(shipment.originLocation.facilityCode, {
        code: shipment.originLocation.facilityCode,
        provider,
        unlocode: shipment.originLocation.unlocode ?? '',
      })
    }

    // Check destination location
    if (shipment.destinationLocation && !isLocationComplete(shipment.destinationLocation) && shipment.destinationLocation.facilityCode) {
      const provider = shipment.destinationLocation.facilityCodeListProvider ?? 'SMDG'
      facilitiesToEnrich.set(shipment.destinationLocation.facilityCode, {
        code: shipment.destinationLocation.facilityCode,
        provider,
        unlocode: shipment.destinationLocation.unlocode ?? '',
      })
    }

    // Check events for facility codes (for route stops enrichment)
    for (const event of events) {
      if (event.facilityCode && event.latitude == null && !event.facilityAddress) {
        const provider = event.facilityCodeListProvider ?? 'SMDG'
        if (!facilitiesToEnrich.has(event.facilityCode)) {
          facilitiesToEnrich.set(event.facilityCode, {
            code: event.facilityCode,
            provider,
            unlocode: event.locationUnlocode ?? '',
          })
        }
      }
    }

    if (facilitiesToEnrich.size === 0) {
      return
    }

    // Create BIC API client
    const client = new BicApiClient({
      baseUrl: bicConfig.baseUrl,
      username: bicConfig.username,
      password: bicConfig.password,
    })

    // Fetch facility data (one call per unique facility)
    const facilityMap = new Map<string, BicFacility>()
    for (const [code, info] of facilitiesToEnrich) {
      try {
        const facility = await client.getFacility(info.code, info.provider, info.unlocode)
        if (facility) {
          facilityMap.set(code, facility)
        }
      } catch (error) {
        console.error('[shipment-tracking:bic] Failed to fetch facility:', {
          facilityCode: code,
          codeProvider: info.provider,
          unlocode: info.unlocode,
          shipmentId: shipment.id,
          error: error instanceof Error ? error.message : String(error),
        })
        // Continue with other facilities - don't fail the whole enrichment
      }
    }

    if (facilityMap.size === 0) {
      return
    }

    // Enrich origin location
    if (shipment.originLocation?.facilityCode && facilityMap.has(shipment.originLocation.facilityCode)) {
      const bic = facilityMap.get(shipment.originLocation.facilityCode)!
      shipment.originLocation = this.mergeLocationWithBicFacility(shipment.originLocation, bic)
    }

    // Enrich destination location
    if (shipment.destinationLocation?.facilityCode && facilityMap.has(shipment.destinationLocation.facilityCode)) {
      const bic = facilityMap.get(shipment.destinationLocation.facilityCode)!
      shipment.destinationLocation = this.mergeLocationWithBicFacility(shipment.destinationLocation, bic)
    }

    // Enrich route stops
    if (shipment.routeStops) {
      for (const stop of shipment.routeStops) {
        if (stop.facilityCode && facilityMap.has(stop.facilityCode)) {
          const bic = facilityMap.get(stop.facilityCode)!
          const coords = BicApiClient.parseCoordinates(bic)
          const address = BicApiClient.formatAddress(bic)
          
          if (!stop.coords && coords) {
            stop.coords = coords
          }
          if (!stop.facilityAddress && address) {
            stop.facilityAddress = address
          }
        }
      }
    }

    // Enrich cargo events
    if (shipment.cargoEvents) {
      for (const event of shipment.cargoEvents) {
        if (event.facilityCode && facilityMap.has(event.facilityCode)) {
          const bic = facilityMap.get(event.facilityCode)!
          const coords = BicApiClient.parseCoordinates(bic)
          const address = BicApiClient.formatAddress(bic)
          
          if (event.latitude == null && coords) {
            event.latitude = coords.latitude
            event.longitude = coords.longitude
          }
          if (!event.facilityAddress && address) {
            event.facilityAddress = address
          }
        }
      }
    }
  }

  /**
   * Merges BIC facility data into a FacilityLocation (only fills missing fields).
   */
  private mergeLocationWithBicFacility(location: FacilityLocation, bic: BicFacility): FacilityLocation {
    const coords = BicApiClient.parseCoordinates(bic)
    const address = BicApiClient.formatAddress(bic)
    const operatorName = BicApiClient.getOperatorName(bic)
    const facilityName = BicApiClient.getFacilityName(bic)

    return mergeLocationWithBicData(location, {
      name: facilityName ?? undefined,
      address: address ?? undefined,
      coords: coords ?? undefined,
      operatorName: operatorName ?? undefined,
    })
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
