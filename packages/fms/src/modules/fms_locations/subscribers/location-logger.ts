/**
 * Event subscriber metadata.
 * Listens to all CRUD events for fms_location entities.
 * 
 * Events triggered:
 * - fms_locations.fms_location.created
 * - fms_locations.fms_location.updated
 * - fms_locations.fms_location.deleted
 * 
 * Note: The NATS driver automatically handles tenant prefixing, so subscribers
 * don't need to be aware of it. Messages published to <tenantId>.fms_locations.fms_location.*
 * are automatically delivered with the tenant prefix stripped.
 */
export const metadata = {
  event: 'fms_locations.fms_location.test', // Wildcard to catch created/updated/deleted
  persistent: false, // Immediate processing, not queued
}

/**
 * Handler that logs fms_location entity events.
 * 
 * This subscriber is triggered whenever a location is created, updated, or deleted.
 * It logs the full event payload for debugging and monitoring purposes.
 * 
 * Payload structure:
 * - id: Record ID (UUID)
 * - organizationId: Organization scope (UUID or null)
 * - tenantId: Tenant scope (UUID or null)
 */
export default async function handle(payload: any): Promise<void> {
  const recordId = String(payload?.id || '')
  const tenantId = payload?.tenantId ?? null
  const organizationId = payload?.organizationId ?? null

  console.log('[fms_locations:location-logger]', {
    event: metadata.event,
    recordId,
    tenantId,
    organizationId,
    timestamp: new Date().toISOString(),
    fullPayload: payload,
  })
}
