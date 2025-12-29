import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { LocationInput, MilestoneInput, ScopedWebhookInput, scopedFreighttechWebhookSchema } from "../../data/validators"
import { EventBus } from "@open-mercato/events/types"
import { EntityManager } from '@mikro-orm/core'
import { WebhookEvent, Location, Milestone } from '../../data/entities'

// Type definitions for change tracking and lifecycle events
interface MilestoneSyncResult {
  created: Milestone[]
  updated: Milestone[]
  unchanged: Milestone[]
}

interface ContainerLifecycleEvent {
  containerId: string
  carrierScac: string
  organizationId: string
  tenantId: string
  eventType: 'departed' | 'arrived' | 'in_transit' | 'discharged' | 'delivered'
  location?: {
    name: string
    unlocode: string
    city: string
    country: string
  }
  timestamp: Date
  milestone?: {
    id: string
    description: string
    eventType: string
    eventClassifier: string
  }
}

// Field-level change tracking: [before, after]
type FieldChange<T = any> = [T, T]

interface WebhookEventChanges {
  status?: FieldChange<string>
  containerId?: FieldChange<string>
  carrierScac?: FieldChange<string>
  containerIso?: FieldChange<string>
  billOfLading?: FieldChange<string | null>
  parentReferenceId?: FieldChange<string | null>
}

interface TrackingChanges {
  isNew: boolean
  fields: WebhookEventChanges
  milestones: {
    created: number
    updated: number
    unchanged: number
  }
}

// Helper function to create Location entity from location data
function createLocationEntity(locationData: LocationInput): Location {
  const location = new Location()
  location.name = locationData.name
  location.city = locationData.city
  location.state = locationData.state
  location.country = locationData.country
  location.unlocode = locationData.unlocode
  location.firmsCd = locationData.firms_cd ?? null
  location.bicCd = locationData.bic_cd ?? null
  location.smdgCd = locationData.smdg_cd ?? null
  location.facility = locationData.facility ?? null
  location.latitude = locationData.geolocation.latitude
  location.longitude = locationData.geolocation.longitude
  return location
}

// Helper function to create or find Location entity with deduplication (database-aware)
async function getOrCreateLocationFromDB(
  locationData: LocationInput,
  locationCache: Map<string, Location>,
  em: EntityManager
): Promise<Location> {
  const key = `${locationData.unlocode}:${locationData.geolocation.latitude}:${locationData.geolocation.longitude}`
  
  // Check in-memory cache first
  if (locationCache.has(key)) {
    return locationCache.get(key)!
  }
  
  // Check database (leverages unique constraint)
  const existing = await em.findOne(Location, {
    unlocode: locationData.unlocode,
    latitude: locationData.geolocation.latitude,
    longitude: locationData.geolocation.longitude,
  })
  
  if (existing) {
    locationCache.set(key, existing)
    return existing
  }
  
  // Create new location
  const location = createLocationEntity(locationData)
  em.persist(location)
  locationCache.set(key, location)
  return location
}

// Helper function to create Milestone entity from milestone data
function createMilestoneEntity(
  milestoneData: MilestoneInput,
  webhookEvent: WebhookEvent,
  location: Location
): Milestone {
  const milestone = new Milestone()
  milestone.externalId = milestoneData.id
  milestone.webhookEvent = webhookEvent
  milestone.timestamp = new Date(milestoneData.timestamp)
  milestone.location = location
  milestone.description = milestoneData.description
  milestone.rawDescription = milestoneData.raw_description
  milestone.journeyType = milestoneData.journey_event.journey_type
  milestone.eventClassifier = milestoneData.journey_event.event_classifier
  milestone.eventType = milestoneData.journey_event.event_type
  milestone.emptyIndicator = milestoneData.journey_event.empty_indicator ?? null
  milestone.transportMode = milestoneData.journey_event.transport_mode ?? null
  milestone.facilityType = milestoneData.journey_event.facility_type ?? null
  milestone.documentType = milestoneData.journey_event.document_type ?? null
  milestone.typeCode = milestoneData.shipment_location.type_code ?? null
  milestone.vessel = milestoneData.vessel ?? null
  milestone.vesselImo = milestoneData.vessel_imo ?? null
  milestone.vesselMmsi = milestoneData.vessel_mmsi ?? null
  milestone.voyage = milestoneData.voyage ?? null
  milestone.planned = milestoneData.planned
  milestone.mode = milestoneData.mode ?? null
  milestone.source = milestoneData.source
  return milestone
}

// Helper function to upsert milestone (create or update)
async function upsertMilestone(
  milestoneData: MilestoneInput,
  webhookEvent: WebhookEvent,
  location: Location,
  em: EntityManager
): Promise<{ milestone: Milestone; isNew: boolean }> {
  const existing = await em.findOne(Milestone, {
    externalId: milestoneData.id,
    webhookEvent: webhookEvent,
  })
  
  if (existing) {
    // Update all mutable fields
    existing.timestamp = new Date(milestoneData.timestamp)
    existing.location = location
    existing.description = milestoneData.description
    existing.rawDescription = milestoneData.raw_description
    existing.journeyType = milestoneData.journey_event.journey_type
    existing.eventClassifier = milestoneData.journey_event.event_classifier
    existing.eventType = milestoneData.journey_event.event_type
    existing.emptyIndicator = milestoneData.journey_event.empty_indicator ?? null
    existing.transportMode = milestoneData.journey_event.transport_mode ?? null
    existing.facilityType = milestoneData.journey_event.facility_type ?? null
    existing.documentType = milestoneData.journey_event.document_type ?? null
    existing.typeCode = milestoneData.shipment_location.type_code ?? null
    existing.vessel = milestoneData.vessel ?? null
    existing.vesselImo = milestoneData.vessel_imo ?? null
    existing.vesselMmsi = milestoneData.vessel_mmsi ?? null
    existing.voyage = milestoneData.voyage ?? null
    existing.planned = milestoneData.planned
    existing.mode = milestoneData.mode ?? null
    existing.source = milestoneData.source
    
    return { milestone: existing, isNew: false }
  }
  
  // Create new milestone
  const milestone = createMilestoneEntity(milestoneData, webhookEvent, location)
  em.persist(milestone)
  return { milestone, isNew: true }
}

// Helper function to sync milestones (merge strategy)
async function syncMilestones(
  milestoneDataList: MilestoneInput[],
  webhookEvent: WebhookEvent,
  locationCache: Map<string, Location>,
  em: EntityManager
): Promise<MilestoneSyncResult> {
  const result: MilestoneSyncResult = {
    created: [],
    updated: [],
    unchanged: [],
  }
  
  const incomingIds = new Set(milestoneDataList.map(m => m.id))
  
  // Fetch existing milestones
  const existingMilestones = await em.find(Milestone, {
    webhookEvent: webhookEvent,
  })
  
  // Upsert incoming milestones
  for (const milestoneData of milestoneDataList) {
    const milestoneLocation = await getOrCreateLocationFromDB(
      milestoneData.location, 
      locationCache, 
      em
    )
    
    const { milestone, isNew } = await upsertMilestone(
      milestoneData,
      webhookEvent,
      milestoneLocation,
      em
    )
    
    if (isNew) {
      result.created.push(milestone)
    } else {
      result.updated.push(milestone)
    }
  }
  
  // Track unchanged milestones (not in incoming payload)
  for (const existing of existingMilestones) {
    if (!incomingIds.has(existing.externalId)) {
      result.unchanged.push(existing)
    }
  }
  
  return result
}

// Helper function to classify milestone as lifecycle event
function classifyMilestoneAsLifecycleEvent(
  milestone: Milestone
): 'departed' | 'arrived' | 'in_transit' | 'discharged' | 'delivered' | null {
  const { eventType, eventClassifier, journeyType } = milestone
  
  // Departure events (vessel/truck departed)
  if (eventClassifier === 'ACT' && eventType === 'DEPA') {
    return 'departed'
  }
  
  // Arrival events (vessel/truck arrived)
  if (eventClassifier === 'ACT' && eventType === 'ARRI') {
    return 'arrived'
  }
  
  // Discharge events (container unloaded from vessel)
  if (eventType === 'DISC') {
    return 'discharged'
  }
  
  // Delivery events (final destination)
  if (eventType === 'DLVR' || (journeyType === 'IMP' && eventClassifier === 'ACT')) {
    return 'delivered'
  }
  
  // In-transit events
  if (eventClassifier === 'ACT' && journeyType === 'TRAN') {
    return 'in_transit'
  }
  
  return null
}

// Helper function to detect container lifecycle events from new milestones
function detectContainerLifecycleEvents(
  newMilestones: Milestone[],
  webhookEvent: WebhookEvent,
  organizationId: string,
  tenantId: string
): ContainerLifecycleEvent[] {
  const events: ContainerLifecycleEvent[] = []
  
  // Only emit events for NEW milestones (not updates)
  for (const milestone of newMilestones) {
    const eventType = classifyMilestoneAsLifecycleEvent(milestone)
    
    if (eventType) {
      events.push({
        containerId: webhookEvent.containerId,
        carrierScac: webhookEvent.carrierScac,
        organizationId,
        tenantId,
        eventType,
        location: {
          name: milestone.location.name,
          unlocode: milestone.location.unlocode,
          city: milestone.location.city,
          country: milestone.location.country,
        },
        timestamp: milestone.timestamp,
        milestone: {
          id: milestone.externalId,
          description: milestone.description,
          eventType: milestone.eventType,
          eventClassifier: milestone.eventClassifier,
        },
      })
    }
  }
  
  return events
}

// Helper function to detect field-level changes
function detectWebhookEventChanges(
  existingEvent: WebhookEvent | null,
  newData: {
    status: string
    containerId: string
    carrierScac: string
    containerIso: string
    billOfLading: string | null
    parentReferenceId: string | null
  }
): WebhookEventChanges {
  if (!existingEvent) {
    return {}
  }

  const changes: WebhookEventChanges = {}

  if (existingEvent.status !== newData.status) {
    changes.status = [existingEvent.status, newData.status]
  }

  if (existingEvent.containerId !== newData.containerId) {
    changes.containerId = [existingEvent.containerId, newData.containerId]
  }

  if (existingEvent.carrierScac !== newData.carrierScac) {
    changes.carrierScac = [existingEvent.carrierScac, newData.carrierScac]
  }

  if (existingEvent.containerIso !== newData.containerIso) {
    changes.containerIso = [existingEvent.containerIso, newData.containerIso]
  }

  if (existingEvent.billOfLading !== newData.billOfLading) {
    changes.billOfLading = [existingEvent.billOfLading, newData.billOfLading]
  }

  if (existingEvent.parentReferenceId !== newData.parentReferenceId) {
    changes.parentReferenceId = [existingEvent.parentReferenceId, newData.parentReferenceId]
  }

  return changes
}

const publishWebhookEventCommand: CommandHandler<ScopedWebhookInput, {}> = {
  id: 'fms_tracking.freighttech.webhook',
  async execute(rawInput, ctx) {
    const input = scopedFreighttechWebhookSchema.parse(rawInput)
    const { 
      status, 
      reference_id, 
      id, 
      payload, 
      organization_id, 
      parent_reference_id, 
      created_at, 
      updated_at 
    } = input.data
    
    console.debug('[fms_tracking.publishWebhookEventCommand] Processing webhook', { 
      status, 
      id, 
      reference_id
    })

    const em = ctx.container.resolve<EntityManager>('em')
    const eventBus = ctx.container.resolve('eventBus') as EventBus
    
    await em.transactional(async (em) => {
      // Check if webhook event already exists
      const existingEvent = await em.findOne(WebhookEvent, { 
        referenceId: reference_id 
      })
      
      let webhookEvent: WebhookEvent
      const isUpdate = !!existingEvent
      
      // Detect field-level changes before updating
      const fieldChanges = detectWebhookEventChanges(existingEvent, {
        status,
        containerId: payload.container_id,
        carrierScac: payload.carrier_scac,
        containerIso: payload.container_iso,
        billOfLading: payload.bill_of_lading ?? null,
        parentReferenceId: parent_reference_id ?? null,
      })
      
      if (existingEvent) {
        // UPDATE existing webhook event
        console.debug('[fms_tracking.publishWebhookEventCommand] Updating existing webhook', {
          referenceId: reference_id,
          changes: fieldChanges
        })
        
        existingEvent.id = id
        existingEvent.status = status
        existingEvent.parentReferenceId = parent_reference_id ?? null
        existingEvent.containerId = payload.container_id
        existingEvent.carrierScac = payload.carrier_scac
        existingEvent.containerIso = payload.container_iso
        existingEvent.billOfLading = payload.bill_of_lading ?? null
        existingEvent.updatedAt = new Date(updated_at)
        
        webhookEvent = existingEvent
      } else {
        // CREATE new webhook event
        console.debug('[fms_tracking.publishWebhookEventCommand] Creating new webhook', {
          referenceId: reference_id
        })
        
        webhookEvent = em.create(WebhookEvent, {
          referenceId: reference_id,
          id,
          status,
          organizationId: organization_id,
          parentReferenceId: parent_reference_id ?? null,
          containerId: payload.container_id,
          carrierScac: payload.carrier_scac,
          containerIso: payload.container_iso,
          billOfLading: payload.bill_of_lading ?? null,
          createdAt: new Date(created_at),
          updatedAt: new Date(updated_at),
        })
      }

      // Flush webhook event to ensure it has a persisted PK before milestone sync
      // This is critical for new webhook events to prevent duplicate milestone creation
      await em.flush()

      // Location cache for deduplication
      const locationCache = new Map<string, Location>()

      // Pre-load main locations
      await getOrCreateLocationFromDB(payload.inland_origin, locationCache, em)
      await getOrCreateLocationFromDB(payload.origin_port, locationCache, em)
      await getOrCreateLocationFromDB(payload.destination_port, locationCache, em)
      await getOrCreateLocationFromDB(payload.inland_destination, locationCache, em)

      // Sync milestones (merge strategy)
      const syncResult = await syncMilestones(
        payload.milestones,
        webhookEvent,
        locationCache,
        em
      )
      
      console.debug('[fms_tracking.publishWebhookEventCommand] Milestone sync completed', {
        created: syncResult.created.length,
        updated: syncResult.updated.length,
        unchanged: syncResult.unchanged.length
      })

      // Flush all database changes
      await em.flush()
      
      // Build change summary
      const changes: TrackingChanges = {
        isNew: !isUpdate,
        fields: fieldChanges,
        milestones: {
          created: syncResult.created.length,
          updated: syncResult.updated.length,
          unchanged: syncResult.unchanged.length,
        }
      }
      
      // Emit general tracking updated event
      await eventBus.emitEvent('fms_tracking.tracking_updated', {
        ...input,
        changes
      })
      
      // Emit container lifecycle events (only for NEW milestones)
      const lifecycleEvents = detectContainerLifecycleEvents(
        syncResult.created,
        webhookEvent,
        organization_id,
        input.tenantId
      )
      
      for (const event of lifecycleEvents) {
        const eventName = `fms_tracking.container.${event.eventType}`
        console.debug('[fms_tracking.publishWebhookEventCommand] Emitting lifecycle event', {
          event: eventName,
          containerId: event.containerId,
          location: event.location?.name
        })
        
        await eventBus.emitEvent(eventName, event, { persistent: true })
      }
      
      if (lifecycleEvents.length > 0) {
        console.debug('[fms_tracking.publishWebhookEventCommand] Emitted lifecycle events', {
          count: lifecycleEvents.length,
          types: lifecycleEvents.map(e => e.eventType)
        })
      }
    })

    return {}
  },
}

registerCommand(publishWebhookEventCommand)

export default publishWebhookEventCommand
