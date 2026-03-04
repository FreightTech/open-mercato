/**
 * FMS Projects Module - Import Tracking API
 * 
 * Creates a TrackingJob in the shipment-tracking module and syncs
 * discovered containers to FmsSeaContainer records in the project.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { Shipment } from '@open-mercato/shipment-tracking'
import { FmsProject } from '../../../../data/entities'
import { syncShipmentsToProject } from '../../../../lib/sea-containers/tracking-sync'

// Type for the TrackingService (imported dynamically to avoid circular deps)
// Reference types must be lowercase to match shipment-tracking module
type TrackingService = {
  createTrackingJob: (input: {
    organizationId: string
    tenantId: string
    carrierCode: string
    referenceType: 'bol' | 'booking' | 'container'
    referenceValue: string
  }) => Promise<{
    trackingJobId: string
    shipmentsCreated: number
    newEvents: number
  }>
}

// Input validation schema
// Reference types must be lowercase to match shipment-tracking module
const importTrackingSchema = z.object({
  carrierCode: z.string().min(1, 'Carrier code is required'),
  referenceType: z.enum(['bol', 'booking', 'container']),
  referenceValue: z.string().min(1, 'Reference value is required'),
})

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
}

// Helper to extract project ID from URL path
function extractProjectIdFromUrl(request: Request): string | null {
  try {
    const url = new URL(request.url)
    const match = url.pathname.match(/\/projects\/([^/]+)\/import-tracking/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// Helper to build scope-aware filters
function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const orgIdsSet = new Set<string>()
  const filterIds = scope?.filterIds
  const allowedIds = scope?.allowedIds
  const fallbackOrgId = scope?.selectedId ?? auth.orgId ?? null

  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    allowedIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (fallbackOrgId) {
    orgIdsSet.add(fallbackOrgId)
  }

  if (orgIdsSet.size > 0) {
    filters.organizationId = { $in: [...orgIdsSet] }
  }

  return filters
}

/**
 * POST /api/fms_projects/projects/[id]/import-tracking
 * 
 * Creates a tracking job and syncs discovered containers to the project.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Get auth
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract project ID from URL
    const projectId = extractProjectIdFromUrl(request)
    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID not found in URL' },
        { status: 400 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = importTrackingSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { carrierCode, referenceType, referenceValue } = parseResult.data

    // Create container and resolve scope
    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const em = container.resolve('em') as EntityManager

    // Determine the org/tenant context
    const organizationId = scope?.selectedId ?? auth.orgId
    const tenantId = auth.tenantId

    if (!organizationId || !tenantId) {
      return NextResponse.json(
        { error: 'Organization and tenant context required' },
        { status: 401 }
      )
    }

    // Build scope filters
    const scopeFilters = buildScopeFilters(auth, scope)

    // Verify project exists and belongs to this org/tenant
    const project = await em.findOne(FmsProject, {
      id: projectId,
      deletedAt: null,
      ...scopeFilters,
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Get tracking service from container
    let trackingService: TrackingService
    try {
      trackingService = container.resolve('shipmentTrackingService') as TrackingService
    } catch {
      return NextResponse.json(
        { error: 'Tracking service not available. The shipment-tracking module may not be loaded.' },
        { status: 503 }
      )
    }

    // Create tracking job via shipment-tracking module
    // This will poll the carrier API and create/update Shipment records
    // Note: carrierCode is passed as-is; tracking service handles case normalization
    const trackingResult = await trackingService.createTrackingJob({
      organizationId,
      tenantId,
      carrierCode,
      referenceType,
      referenceValue,
    })

    // Load the shipments created/updated by the tracking job
    // Fork the EM to get fresh data after tracking service operations
    const freshEm = em.fork()
    const shipments = await freshEm.find(Shipment, {
      trackingJob: { id: trackingResult.trackingJobId },
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (shipments.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No containers found for the given reference. Please verify the carrier code and reference value.',
        trackingJobId: trackingResult.trackingJobId,
        containersCreated: 0,
        containersUpdated: 0,
        shipmentsFound: 0,
      }, { status: 404 })
    }

    // Sync shipments to FmsSeaContainer records
    const syncResult = await syncShipmentsToProject(
      freshEm,
      shipments,
      project,
      organizationId,
      tenantId
    )

    return NextResponse.json({
      success: true,
      trackingJobId: trackingResult.trackingJobId,
      containersCreated: syncResult.containersCreated,
      containersUpdated: syncResult.containersUpdated,
      containersSkipped: syncResult.containersSkipped,
      shipmentsFound: shipments.length,
      containers: syncResult.results.map(r => ({
        id: r.containerId,
        containerNumber: r.containerNumber,
        action: r.created ? 'created' : 'updated',
      })),
    })
  } catch (error) {
    console.error('[import-tracking] Error:', error)

    // Handle known error types
    if (error instanceof Error) {
      if (error.message.includes('No adapter registered for carrier')) {
        return NextResponse.json(
          { error: `Carrier not supported: ${error.message}` },
          { status: 400 }
        )
      }
      if (error.message.includes('rate limit')) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Failed to import tracking data. Please try again.' },
      { status: 500 }
    )
  }
}

// OpenAPI documentation
export const openApi = {
  POST: {
    operationId: 'importProjectTracking',
    summary: 'Import containers from carrier tracking',
    description: 'Creates a tracking job and syncs discovered containers to the project',
    tags: ['FMS Projects', 'Tracking'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['carrierCode', 'referenceType', 'referenceValue'],
            properties: {
              carrierCode: {
                type: 'string',
                description: 'Carrier code (e.g., maersk, msc, hapag-lloyd)',
                example: 'maersk',
              },
              referenceType: {
                type: 'string',
                enum: ['bol', 'booking', 'container'],
                description: 'Type of reference to track',
              },
              referenceValue: {
                type: 'string',
                description: 'The reference number to track',
                example: 'MAEU123456789',
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Successfully imported containers',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                trackingJobId: { type: 'string', format: 'uuid' },
                containersCreated: { type: 'integer' },
                containersUpdated: { type: 'integer' },
                containersSkipped: { type: 'integer', description: 'Number of shipments skipped due to invalid container numbers' },
                shipmentsFound: { type: 'integer' },
                containers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      containerNumber: { type: 'string', nullable: true },
                      action: { type: 'string', enum: ['created', 'updated'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      400: {
        description: 'Invalid request or unsupported carrier',
      },
      404: {
        description: 'Project not found or no containers found',
      },
      429: {
        description: 'Rate limit exceeded',
      },
    },
  },
}
