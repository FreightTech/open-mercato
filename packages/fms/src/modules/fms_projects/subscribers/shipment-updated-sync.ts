/**
 * Shipment Updated Sync Subscriber
 * 
 * Listens to shipment_tracking.shipment.updated events and automatically
 * syncs changes to any FmsSeaContainer records linked via trackedShipmentId.
 * 
 * This enables automatic updates when:
 * - Container tracking data changes
 * - New cargo events are discovered
 * - ETA/ETD updates occur
 * - Status changes
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { Shipment } from '@open-mercato/shipment-tracking'
import { FmsSeaContainer } from '../data/entities'
import { syncShipmentToContainer } from '../lib/sea-containers/tracking-sync'
import type { SubscriberContext } from '@open-mercato/events'

/**
 * Event subscriber metadata.
 * Listens to shipment updated events from the shipment-tracking module.
 */
export const metadata = {
  event: 'shipment_tracking.shipment.updated',
  persistent: true, // Use queue for reliable processing
  id: 'fms_projects.shipment_updated_sync',
}

/**
 * Payload type from shipment_tracking.shipment.updated event
 */
type ShipmentUpdatedPayload = {
  id: string
  tenantId: string
  organizationId: string
}

/**
 * Handler that syncs shipment updates to linked FmsSeaContainer records.
 * 
 * When a Shipment is updated (new events, ETA changes, status changes, etc.),
 * this subscriber finds all FmsSeaContainer records that are linked to that
 * Shipment via trackedShipmentId and updates them with the latest data.
 * 
 * Payload structure:
 * - id: Shipment ID (UUID)
 * - organizationId: Organization scope (UUID)
 * - tenantId: Tenant scope (UUID)
 */
export default async function handle(
  payload: ShipmentUpdatedPayload,
  context?: SubscriberContext
): Promise<void> {
  const shipmentId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!shipmentId || !tenantId || !organizationId) {
    console.warn('[fms_projects:shipment-updated-sync] Missing required payload fields', {
      shipmentId,
      tenantId,
      organizationId,
    })
    return
  }

  // Get EntityManager from context
  const resolve = context?.resolve
  if (!resolve) {
    console.error('[fms_projects:shipment-updated-sync] No resolve function in context')
    return
  }

  const em = resolve('em') as EntityManager
  const forkedEm = em.fork()

  try {
    // Find the updated shipment
    const shipment = await forkedEm.findOne(Shipment, {
      id: shipmentId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!shipment) {
      console.debug('[fms_projects:shipment-updated-sync] Shipment not found:', shipmentId)
      return
    }

    // Find all FmsSeaContainer records linked to this shipment
    const linkedContainers = await forkedEm.find(FmsSeaContainer, {
      trackedShipmentId: shipmentId,
      tenantId,
      organizationId,
      deletedAt: null,
    }, {
      populate: ['project'],
    })

    if (linkedContainers.length === 0) {
      console.debug('[fms_projects:shipment-updated-sync] No linked containers for shipment:', shipmentId)
      return
    }

    console.log('[fms_projects:shipment-updated-sync] Syncing shipment to containers', {
      shipmentId,
      containerCount: linkedContainers.length,
    })

    // Sync each linked container
    for (const container of linkedContainers) {
      const projectId = container.project?.id
      if (!projectId) {
        console.warn('[fms_projects:shipment-updated-sync] Container missing project:', container.id)
        continue
      }

      const result = await syncShipmentToContainer(
        forkedEm,
        shipment,
        { id: projectId },
        organizationId,
        tenantId
      )

      console.debug('[fms_projects:shipment-updated-sync] Container synced', {
        containerId: result.containerId,
        containerNumber: result.containerNumber,
        updated: result.updated,
      })
    }

    console.log('[fms_projects:shipment-updated-sync] Sync completed', {
      shipmentId,
      containersUpdated: linkedContainers.length,
    })
  } catch (error) {
    console.error('[fms_projects:shipment-updated-sync] Error syncing shipment:', error)
    
    // Non-retryable errors: data invariants that won't change on retry
    // - TypeError/ReferenceError: Code bugs, not transient issues
    // - Validation errors from MikroORM
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable = 
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('violates')
    
    if (isNonRetryable) {
      console.error('[fms_projects:shipment-updated-sync] Non-retryable error, skipping retry:', errorMessage)
      return // Don't retry - would fail again with same data
    }
    
    throw error // Re-throw transient errors for queue retry
  }
}
