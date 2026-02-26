/**
 * Tracking Sync Library
 *
 * Helper functions for syncing Shipment data from shipment-tracking module
 * to FmsSeaContainer entities in FMS projects.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsSeaContainer, FmsProject } from '../../data/entities'
import type { Shipment } from '@open-mercato/shipment-tracking'
import type {
  FacilityLocation,
  ShipmentTimestampEntry,
  RouteStopEntry,
  CargoEventEntry,
  SyncStatus,
  SeaContainerStatus,
} from '../../data/types'

/**
 * Maps Shipment entity fields to FmsSeaContainer entity fields.
 * This is the core transformation function for tracking sync.
 */
export function mapShipmentToSeaContainer(shipment: Shipment): Partial<FmsSeaContainer> {
  return {
    // Container identifiers
    containerNumber: shipment.containerNumber ?? null,
    containerType: shipment.isoEquipmentCode ?? null, // Direct copy - now free-form string
    bookingNumber: shipment.bookingNumber ?? null,
    bolNumber: shipment.bolNumber ?? null,

    // Carrier & Vessel info
    carrierCode: shipment.carrierCode ?? null,
    vesselName: shipment.vesselName ?? null,
    vesselImo: shipment.vesselImo ?? null,
    voyageNumber: shipment.voyageNumber ?? null,

    // Rich location data (JSONB)
    originLocation: (shipment.originLocation as FacilityLocation) ?? null,
    destinationLocation: (shipment.destinationLocation as FacilityLocation) ?? null,

    // Multi-source timestamps (JSONB arrays)
    etdTimestamps: (shipment.etdTimestamps as ShipmentTimestampEntry[]) ?? null,
    etaTimestamps: (shipment.etaTimestamps as ShipmentTimestampEntry[]) ?? null,
    atdTimestamps: (shipment.atdTimestamps as ShipmentTimestampEntry[]) ?? null,
    ataTimestamps: (shipment.ataTimestamps as ShipmentTimestampEntry[]) ?? null,

    // Route and events (JSONB)
    routeStops: (shipment.routeStops as RouteStopEntry[]) ?? null,
    cargoEvents: (shipment.cargoEvents as CargoEventEntry[]) ?? null,
    eventCount: shipment.eventCount ?? 0,
    lastEventAt: shipment.lastEventAt ?? null,

    // Status mapping - Shipment and SeaContainer now use same enum values
    status: (shipment.status as SeaContainerStatus) ?? 'PENDING',

    // Tracking link
    trackedShipmentId: shipment.id,
    lastSyncedAt: new Date(),
    syncStatus: 'synced' as SyncStatus,
  }
}

/**
 * Result of syncing a shipment to a container
 */
export type SyncResult = {
  created: boolean
  updated: boolean
  containerId: string
  containerNumber: string | null
}

/**
 * Syncs a Shipment to an FmsSeaContainer, creating or updating as needed.
 *
 * Duplicate handling:
 * - If a container with the same containerNumber exists in the project → update it
 * - If no matching container exists → create new one
 *
 * @param em - EntityManager for database operations
 * @param shipment - The Shipment entity from shipment-tracking module
 * @param project - The FmsProject to add the container to (or Reference)
 * @param organizationId - Organization scope
 * @param tenantId - Tenant scope
 * @returns SyncResult indicating whether container was created or updated
 */
export async function syncShipmentToContainer(
  em: EntityManager,
  shipment: Shipment,
  project: FmsProject | { id: string },
  organizationId: string,
  tenantId: string,
): Promise<SyncResult> {
  const projectId = 'id' in project ? project.id : (project as FmsProject).id
  const mappedData = mapShipmentToSeaContainer(shipment)

  // Check for existing container by containerNumber + project (or by trackedShipmentId)
  let existing: FmsSeaContainer | null = null

  // First try to find by trackedShipmentId (most reliable for updates)
  if (shipment.id) {
    existing = await em.findOne(FmsSeaContainer, {
      trackedShipmentId: shipment.id,
      deletedAt: null,
    })
  }

  // If not found by shipmentId, try by containerNumber in same project
  if (!existing && shipment.containerNumber) {
    existing = await em.findOne(FmsSeaContainer, {
      project: projectId,
      containerNumber: shipment.containerNumber,
      deletedAt: null,
    })
  }

  if (existing) {
    // UPDATE existing container with tracking data
    Object.assign(existing, mappedData)
    await em.flush()

    return {
      created: false,
      updated: true,
      containerId: existing.id,
      containerNumber: existing.containerNumber ?? null,
    }
  }

  // CREATE new container
  const projectRef = em.getReference(FmsProject, projectId)

  // Create container with explicit field assignments (MikroORM requires all required fields)
  const container = new FmsSeaContainer()
  container.project = projectRef
  container.organizationId = organizationId
  container.tenantId = tenantId
  container.ownershipType = 'coc'
  container.isActive = true
  container.isHazardous = false

  // Apply all mapped fields from shipment
  container.containerNumber = mappedData.containerNumber ?? null
  container.containerType = mappedData.containerType ?? null
  container.bookingNumber = mappedData.bookingNumber ?? null
  container.bolNumber = mappedData.bolNumber ?? null
  container.carrierCode = mappedData.carrierCode ?? null
  container.vesselName = mappedData.vesselName ?? null
  container.vesselImo = mappedData.vesselImo ?? null
  container.voyageNumber = mappedData.voyageNumber ?? null
  container.originLocation = mappedData.originLocation ?? null
  container.destinationLocation = mappedData.destinationLocation ?? null
  container.etdTimestamps = mappedData.etdTimestamps ?? null
  container.etaTimestamps = mappedData.etaTimestamps ?? null
  container.atdTimestamps = mappedData.atdTimestamps ?? null
  container.ataTimestamps = mappedData.ataTimestamps ?? null
  container.routeStops = mappedData.routeStops ?? null
  container.cargoEvents = mappedData.cargoEvents ?? null
  container.eventCount = mappedData.eventCount ?? 0
  container.lastEventAt = mappedData.lastEventAt ?? null
  container.status = mappedData.status ?? 'PENDING'
  container.trackedShipmentId = mappedData.trackedShipmentId ?? null
  container.lastSyncedAt = mappedData.lastSyncedAt ?? null
  container.syncStatus = mappedData.syncStatus ?? null

  em.persist(container)
  await em.flush()

  return {
    created: true,
    updated: false,
    containerId: container.id,
    containerNumber: container.containerNumber ?? null,
  }
}

/**
 * Syncs multiple shipments to a project.
 * 
 * Performance: Uses batched database operations when possible.
 * - Pre-fetches all existing containers matching shipment IDs or container numbers
 * - Batches all creates/updates in a single flush at the end
 *
 * @param em - EntityManager for database operations
 * @param shipments - Array of Shipment entities to sync
 * @param project - The FmsProject to add containers to
 * @param organizationId - Organization scope
 * @param tenantId - Tenant scope
 * @returns Summary of sync results
 */
export async function syncShipmentsToProject(
  em: EntityManager,
  shipments: Shipment[],
  project: FmsProject | { id: string },
  organizationId: string,
  tenantId: string,
): Promise<{
  containersCreated: number
  containersUpdated: number
  results: SyncResult[]
}> {
  if (shipments.length === 0) {
    return { containersCreated: 0, containersUpdated: 0, results: [] }
  }

  const projectId = 'id' in project ? project.id : (project as FmsProject).id
  const projectRef = em.getReference(FmsProject, projectId)
  
  // Collect identifiers for batch lookup
  const shipmentIds = shipments.map(s => s.id).filter(Boolean)
  const containerNumbers = shipments.map(s => s.containerNumber).filter(Boolean) as string[]

  // Batch fetch existing containers by trackedShipmentId
  const existingByShipmentId = new Map<string, FmsSeaContainer>()
  if (shipmentIds.length > 0) {
    const containers = await em.find(FmsSeaContainer, {
      trackedShipmentId: { $in: shipmentIds },
      deletedAt: null,
    })
    for (const c of containers) {
      if (c.trackedShipmentId) {
        existingByShipmentId.set(c.trackedShipmentId, c)
      }
    }
  }

  // Batch fetch existing containers by containerNumber in this project
  const existingByContainerNumber = new Map<string, FmsSeaContainer>()
  if (containerNumbers.length > 0) {
    const containers = await em.find(FmsSeaContainer, {
      project: projectId,
      containerNumber: { $in: containerNumbers },
      deletedAt: null,
    })
    for (const c of containers) {
      if (c.containerNumber) {
        existingByContainerNumber.set(c.containerNumber, c)
      }
    }
  }

  const results: SyncResult[] = []
  let containersCreated = 0
  let containersUpdated = 0

  // Process all shipments without flushing
  for (const shipment of shipments) {
    const mappedData = mapShipmentToSeaContainer(shipment)
    
    // Find existing container (by shipmentId first, then by containerNumber)
    let existing: FmsSeaContainer | undefined
    if (shipment.id) {
      existing = existingByShipmentId.get(shipment.id)
    }
    if (!existing && shipment.containerNumber) {
      existing = existingByContainerNumber.get(shipment.containerNumber)
    }

    if (existing) {
      // UPDATE existing container
      Object.assign(existing, mappedData)
      containersUpdated++
      results.push({
        created: false,
        updated: true,
        containerId: existing.id,
        containerNumber: existing.containerNumber ?? null,
      })
    } else {
      // CREATE new container
      const container = new FmsSeaContainer()
      container.project = projectRef
      container.organizationId = organizationId
      container.tenantId = tenantId
      container.ownershipType = 'coc'
      container.isActive = true
      container.isHazardous = false

      // Apply all mapped fields
      container.containerNumber = mappedData.containerNumber ?? null
      container.containerType = mappedData.containerType ?? null
      container.bookingNumber = mappedData.bookingNumber ?? null
      container.bolNumber = mappedData.bolNumber ?? null
      container.carrierCode = mappedData.carrierCode ?? null
      container.vesselName = mappedData.vesselName ?? null
      container.vesselImo = mappedData.vesselImo ?? null
      container.voyageNumber = mappedData.voyageNumber ?? null
      container.originLocation = mappedData.originLocation ?? null
      container.destinationLocation = mappedData.destinationLocation ?? null
      container.etdTimestamps = mappedData.etdTimestamps ?? null
      container.etaTimestamps = mappedData.etaTimestamps ?? null
      container.atdTimestamps = mappedData.atdTimestamps ?? null
      container.ataTimestamps = mappedData.ataTimestamps ?? null
      container.routeStops = mappedData.routeStops ?? null
      container.cargoEvents = mappedData.cargoEvents ?? null
      container.eventCount = mappedData.eventCount ?? 0
      container.lastEventAt = mappedData.lastEventAt ?? null
      container.status = mappedData.status ?? 'PENDING'
      container.trackedShipmentId = mappedData.trackedShipmentId ?? null
      container.lastSyncedAt = mappedData.lastSyncedAt ?? null
      container.syncStatus = mappedData.syncStatus ?? null

      em.persist(container)
      containersCreated++
      
      // Add to map for potential duplicates in same batch
      if (shipment.id) {
        existingByShipmentId.set(shipment.id, container)
      }
      if (shipment.containerNumber) {
        existingByContainerNumber.set(shipment.containerNumber, container)
      }
      
      results.push({
        created: true,
        updated: false,
        containerId: container.id, // Will be populated after flush
        containerNumber: container.containerNumber ?? null,
      })
    }
  }

  // Single flush for all operations
  await em.flush()

  // Update results with actual IDs for newly created containers
  // (MikroORM populates IDs after flush)

  return {
    containersCreated,
    containersUpdated,
    results,
  }
}
