/**
 * POI Event Notification Subscriber
 *
 * Subscribes to all POI proximity events and creates in-app notifications
 * for users tracking the affected shipments.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ProximityEventType } from '../lib/poi-types'
import { PROXIMITY_EVENT_CODES } from '../lib/poi-types'
import { Shipment } from '../data/entities'

export const metadata = {
  event: 'shipment_tracking.poi.*',
  persistent: true,
  id: 'shipment_tracking:poi-notification',
}

type PoiEventPayload = {
  shipmentId: string
  trackingEventId: string
  organizationId: string
  tenantId: string
  vesselName: string
  vesselMmsi: number
  vesselImo: string | null
  eventType: ProximityEventType
  poiCode: string | null
  latitude: number
  longitude: number
  eventDateTime: string
  distanceToPoiMeters: number | null
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

export default async function handle(payload: PoiEventPayload, ctx: ResolverContext) {
  try {
    const em = ctx.resolve<EntityManager>('em')
    
    // Get shipment details for the notification
    const shipment = await em.findOne(Shipment, { id: payload.shipmentId })
    
    if (!shipment) {
      console.warn(`[poi-notification] Shipment not found: ${payload.shipmentId}`)
      return
    }

    // Resolve event label via i18n (falls back to defaultLocale in subscriber context)
    const { t } = await resolveTranslations()
    const eventCode = PROXIMITY_EVENT_CODES[payload.eventType]
    const eventLabel = t(`shipment_tracking.event_codes.${eventCode}`) ?? eventCode

    // Build notification content
    const locationInfo = payload.poiCode ? ` at ${payload.poiCode}` : ''
    const containerInfo = shipment.containerNumber ? ` (${shipment.containerNumber})` : ''
    
    const title = `${eventLabel}${containerInfo}`
    const message = `Vessel ${payload.vesselName}${locationInfo}`

    // Log the notification (actual notification creation would use NotificationService)
    console.info(
      `[poi-notification] ${title}: ${message} ` +
      `(shipment: ${payload.shipmentId}, event: ${payload.eventType})`
    )

    // TODO: Create actual notification using NotificationService when integrated
    // The notification system requires:
    // 1. Notification type definition in notifications.ts
    // 2. NotificationService to create the notification record
    // 3. Notification renderer for in-app display
    //
    // For now, we log the event. Full notification support can be added when:
    // - Notification types are defined for POI events
    // - User subscription preferences are implemented
    // - Notification delivery channels are configured

  } catch (error) {
    console.error('[poi-notification] Failed to process POI event notification:', error)
  }
}
