/**
 * Auto-Create Project from Booking Confirmation Subscriber
 *
 * Listens to fms_documents.document.processed events and automatically
 * creates FmsProject records when a booking confirmation document is processed.
 *
 * Features:
 * - Creates FmsProject with data extracted from document (all fields including
 *   vessel, voyage, dates, carrier, cargo description)
 * - Starts tracking via import-tracking pattern (containers created by tracking sync)
 * - Links related documents (by booking number, BL number, or container number)
 * - Matches client using Meilisearch fuzzy search
 *
 * Note: Placeholder containers are NOT created. Real containers with valid
 * container numbers are created by the tracking import (syncShipmentsToProject)
 * which validates container numbers against ISO 6346 format.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject } from '../data/entities'
import { Contractor } from '../../contractors/data/entities'
import { FmsCarrier } from '../../fms_products/data/entities'
import { FmsDocument, DocumentCategory } from '../../fms_documents/data/entities'
import { Shipment } from '@open-mercato/shipment-tracking'
import { detectCarrierCode, detectCarrierCodeFromName } from '../lib/carrier-scac-mapper'
import { matchClient } from '../lib/client-matcher'
import { findMatchingDocumentIds } from '../../fms_documents/services/project-matcher.service'
import { syncShipmentsToProject } from '../lib/sea-containers/tracking-sync'
import { createFmsLogger } from '../../../lib/logger'
import type { DocumentProcessedPayload } from '../../fms_documents/events'
import type { SubscriberContext } from '@open-mercato/events'

const logger = createFmsLogger('fms_projects.auto_create_from_booking')

/**
 * Event subscriber metadata.
 * Listens to document processed events from the fms_documents module.
 */
export const metadata = {
  event: 'fms_documents.document.processed',
  persistent: true, // Use queue for reliable processing
  id: 'fms_projects.auto_create_from_booking',
}

/**
 * Type for the TrackingService
 */
interface TrackingService {
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

/**
 * Extracted data structure from booking_confirmation schema
 * Matches the YAML schema in fms_documents/data/schemas/booking_confirmation.yaml
 * 
 * Note: The LLM extraction may produce data in different structures:
 * - Top-level fields (e.g., booking_number)
 * - Nested under 'transportation' object (e.g., transportation.booking_number)
 * This interface covers both patterns.
 */
interface BookingConfirmationData {
  // Top-level identifiers (may exist at root or nested)
  booking_number?: string
  bl_number?: string
  mbl_number?: string
  
  // LLM may produce data nested under transportation object
  transportation?: {
    booking_number?: string
    job_no?: string
    bl_number?: string
    hbl_number?: string
    hbl_no?: string
    mbl_number?: string
    mbl_no?: string
    vessel_name?: string
    vessel?: string
    voyage_number?: string
    port_of_loading?: string
    pol?: string
    port_of_discharge?: string
    pod?: string
    etd?: string
    eta?: string
  }
  
  carrier?: { name?: string; scac_code?: string }
  vessel?: { name?: string; voyage_number?: string }
  routing?: { port_of_loading?: string; port_of_discharge?: string }
  dates?: {
    etd?: string
    eta?: string
    cutoff_vgm?: string
    cutoff_si?: string
    cutoff_cy?: string
  }
  containers?: Array<{ container_number?: string; type?: string; size_type?: string; quantity?: number }>
  container_details?: Array<{ container_number?: string; type?: string; size_type?: string; container_type?: string; quantity?: number }>
  cargo?: { description?: string; weight_kg?: number }
  cargo_description?: string
  shipper?: { name?: string }
  consignee?: { name?: string }
}

/**
 * Generate a simplified project number for sea imports
 * Format: IMP/SEA/{SEQUENCE}/{YEAR}
 */
async function generateSimplifiedProjectNumber(
  em: EntityManager,
  tenantId: string,
  organizationId: string
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = 'IMP/SEA/'
  const suffix = `/${year}`

  // Find the highest sequence number for this type/year combination
  const rows = await em.getConnection().execute(
    `SELECT project_number FROM fms_projects
     WHERE tenant_id = ? AND organization_id = ? AND project_number LIKE ?
     ORDER BY project_number DESC LIMIT 1`,
    [tenantId, organizationId, `${prefix}%${suffix}`]
  )

  let nextSeq = 1
  if (rows.length > 0) {
    const lastNumber = rows[0].project_number as string
    // Extract sequence from format: IMP/SEA/NNNN/YEAR
    const parts = lastNumber.split('/')
    if (parts.length >= 3) {
      const parsed = parseInt(parts[2], 10)
      if (!isNaN(parsed)) {
        nextSeq = parsed + 1
      }
    }
  }

  const seqStr = String(nextSeq).padStart(4, '0')
  return `${prefix}${seqStr}${suffix}`
}

/**
 * Escape SQL LIKE wildcard characters (% and _) in search terms
 * to treat them as literal characters in LIKE patterns.
 */
function escapeLikePattern(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Lookup carrier entity by name using direct database query
 * Searches both code and name fields
 */
async function lookupCarrierByName(
  em: EntityManager,
  carrierName: string,
  tenantId: string,
  organizationId: string
): Promise<{ id: string; name: string } | null> {
  // Normalize to carrier code using existing patterns (for better matching)
  const carrierCode = detectCarrierCodeFromName(carrierName)
  const searchTerm = carrierCode || carrierName.substring(0, 30).trim()

  if (searchTerm.length < 2) return null

  try {
    // Try exact match on code first
    let carrier = await em.findOne(FmsCarrier, {
      code: searchTerm.toUpperCase(),
      tenantId,
      organizationId,
      deletedAt: null,
    })

    // If no exact match, try partial name match
    // Note: escape SQL wildcards to prevent LIKE pattern injection
    if (!carrier) {
      const escapedTerm = escapeLikePattern(searchTerm)
      carrier = await em.findOne(FmsCarrier, {
        name: { $like: `%${escapedTerm}%` },
        tenantId,
        organizationId,
        deletedAt: null,
      })
    }

    if (carrier) {
      return { id: carrier.id, name: carrier.name }
    }

    return null
  } catch (error) {
    logger.warn('carrier_lookup_failed', {
      carrierName,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Parse date string to Date object, handling various formats
 */
function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/**
 * Handler that creates FmsProject from booking confirmation documents.
 *
 * When a booking confirmation document is processed with AI extraction,
 * this subscriber:
 * 1. Creates a new FmsProject with all extracted data (including vessel, dates, carrier)
 * 2. Starts tracking via trackingService (containers created by syncShipmentsToProject)
 * 3. Links related documents by matching identifiers
 */
export default async function handle(
  payload: DocumentProcessedPayload,
  context?: SubscriberContext
): Promise<void> {
  const documentId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId
  const category = payload?.category

  if (!documentId || !tenantId || !organizationId) {
    logger.warn('missing_required_fields', {
      documentId,
      tenantId: !!tenantId,
      organizationId: !!organizationId,
    })
    return
  }

  // Only process booking confirmation documents
  if (category !== DocumentCategory.BOOKING_CONFIRMATION && category !== 'booking_confirmation') {
    logger.debug('skipping_non_booking_document', { documentId, category })
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    logger.error('no_resolve_function', new Error('No resolve function in context'), { documentId })
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
    // Load the document with extracted data
    const document = await em.findOne(FmsDocument, {
      id: documentId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!document) {
      logger.warn('document_not_found', { documentId })
      return
    }

    // Skip if document is already linked to a project
    if (document.relatedEntityId) {
      logger.debug('document_already_linked', {
        documentId,
        relatedEntityId: document.relatedEntityId,
      })
      return
    }

    const extractedData = document.extractedData as BookingConfirmationData | null
    if (!extractedData) {
      logger.warn('no_extracted_data', { documentId })
      return
    }

    // ============================================
    // Extract data using document fields (already populated by extraction route)
    // and fall back to extractedData for nested schema fields
    // The LLM may produce data in different structures, so we check multiple paths
    // ============================================

    // Get transportation object (LLM may nest fields here)
    const transportation = extractedData.transportation

    // Identifiers - use document fields first (already extracted and normalized by extraction route)
    // Then fall back to extractedData paths (both top-level and nested under transportation)
    const bookingNumber = document.bookingNumber 
      || extractedData.booking_number
      || transportation?.booking_number
      || transportation?.job_no

    const blNumber = document.blNumber 
      || extractedData.bl_number
      || transportation?.bl_number
      || transportation?.hbl_number
      || transportation?.hbl_no

    const mblNumber = document.mblNumber 
      || extractedData.mbl_number
      || transportation?.mbl_number
      || transportation?.mbl_no

    // Carrier info
    const carrier = extractedData.carrier
    const carrierCode = detectCarrierCode(carrier)

    // Vessel info (check both vessel object and transportation object)
    const vesselName = extractedData.vessel?.name
      || transportation?.vessel_name
      || transportation?.vessel

    const voyageNumber = extractedData.vessel?.voyage_number
      || transportation?.voyage_number

    // Dates (nested under dates object, or under transportation)
    const etd = parseDate(extractedData.dates?.etd)
      || parseDate(transportation?.etd)

    const eta = parseDate(extractedData.dates?.eta)
      || parseDate(transportation?.eta)

    const vgmCutoffDate = parseDate(extractedData.dates?.cutoff_vgm)
    const docCutoffDate = parseDate(extractedData.dates?.cutoff_si)
    const gateCloseDate = parseDate(extractedData.dates?.cutoff_cy)

    // Routing (nested under routing object, or under transportation)
    const portOfLoading = extractedData.routing?.port_of_loading
      || transportation?.port_of_loading
      || transportation?.pol

    const portOfDischarge = extractedData.routing?.port_of_discharge
      || transportation?.port_of_discharge
      || transportation?.pod

    // Cargo description
    const commodityDescription = extractedData.cargo?.description || extractedData.cargo_description

    // Parties for client matching
    const shipper = extractedData.shipper
    const consignee = extractedData.consignee

    // Container numbers from container details (for document matching and count)
    const rawContainers = extractedData.containers || extractedData.container_details || []
    const containerNumbers = rawContainers
      .map((c) => c.container_number)
      .filter((n): n is string => Boolean(n && n.trim()))

    logger.info('creating_project_from_booking', {
      documentId,
      bookingNumber,
      blNumber,
      carrierCode,
      vesselName,
      voyageNumber,
      etd: etd?.toISOString(),
      eta: eta?.toISOString(),
      portOfLoading,
      portOfDischarge,
      containerCount: containerNumbers.length,
    })

    // Generate project number
    const projectNumber = await generateSimplifiedProjectNumber(em, tenantId, organizationId)

    // Try to match client
    let clientId: string | null = null
    try {
      const clientMatch = await matchClient(resolve, { shipper, consignee }, { tenantId, organizationId })
      if (clientMatch) {
        clientId = clientMatch.contractorId
        logger.debug('client_matched', {
          documentId,
          clientId,
          matchedField: clientMatch.matchedField,
          matchedName: clientMatch.name,
        })
      }
    } catch (error) {
      logger.warn('client_match_failed', {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      }, { tenantId, organizationId })
      // Continue without client - user can assign manually
    }

    // Try to match carrier
    let matchedCarrierId: string | null = null
    let carrierNameToStore: string | null = carrier?.name || null
    if (carrier?.name) {
      try {
        const carrierMatch = await lookupCarrierByName(em, carrier.name, tenantId, organizationId)
        if (carrierMatch) {
          matchedCarrierId = carrierMatch.id
          carrierNameToStore = carrierMatch.name // Use canonical name from entity
          logger.debug('carrier_matched', {
            documentId,
            carrierId: matchedCarrierId,
            carrierName: carrierNameToStore,
          })
        }
      } catch (error) {
        logger.warn('carrier_match_failed', {
          documentId,
          error: error instanceof Error ? error.message : String(error),
        })
        // Continue with extracted name - user can assign manually
      }
    }

    // Create the project with all extracted fields
    // Use retry loop to handle race conditions on project number generation
    const now = new Date()
    let project: FmsProject
    const MAX_RETRIES = 3

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Regenerate project number on retry (in case of collision)
        const attemptProjectNumber =
          attempt === 0 ? projectNumber : await generateSimplifiedProjectNumber(em, tenantId, organizationId)

        project = em.create(FmsProject, {
          organizationId,
          tenantId,
          projectNumber: attemptProjectNumber,
          shipmentType: 'IMP', // Import for booking confirmations
          direction: 'import',
          cargoType: 'fcl', // Default to FCL for sea
          transportModes: ['sea'],

          // Client
          client: clientId ? em.getReference(Contractor, clientId) : null,

          // Identifiers
          bookingNumber: bookingNumber || null,
          blNumber: blNumber || mblNumber || null,

          // Carrier info (use reference if matched)
          carrier: matchedCarrierId ? em.getReference(FmsCarrier, matchedCarrierId) : null,

          // Note: vesselName, voyageNumber, carrierName belong to FmsProjectLeg, not FmsProject
          // These will be populated when a leg is created or via tracking sync

          // Dates
          etd: etd,
          eta: eta,
          vgmCutoffDate: vgmCutoffDate,
          docCutoffDate: docCutoffDate,
          gateCloseDate: gateCloseDate,

          // Routing (text addresses - user can manually select locations later)
          originAddress: portOfLoading || null,
          destinationAddress: portOfDischarge || null,
          // Note: originLocation and destinationLocation are relations, set to null
          // User can manually select locations later via entity search
          originLocation: null,
          destinationLocation: null,

          // Cargo
          commodityDescription: commodityDescription || null,
          containerCount: containerNumbers.length || rawContainers.length || null,

          // Status and defaults
          currentStep: 'draft',
          projectDate: now,
          currencyCode: 'USD',
          requiresInsurance: false,
          requiresCustomsBrokerage: true, // Imports typically need customs
          isHazardous: false,
          isDomestic: false,
          createdAt: now,
          updatedAt: now,
        })

        em.persist(project)
        await em.flush()

        // Success - break out of retry loop
        break
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const isDuplicateKey =
          errorMessage.includes('duplicate key') ||
          errorMessage.includes('unique constraint') ||
          errorMessage.includes('violates unique') ||
          (error as { code?: string }).code === '23505' // PostgreSQL unique violation

        if (isDuplicateKey && attempt < MAX_RETRIES - 1) {
          logger.warn('project_number_collision_retry', {
            documentId,
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
          })
          // Clear the entity from EM before retry
          em.clear()
          continue
        }
        throw error
      }
    }

    // TypeScript flow analysis: project is guaranteed to be assigned if we reach here
    // (either the loop succeeded or threw an error)
    project = project!

    logger.info('project_created', {
      documentId,
      projectId: project.id,
      projectNumber: project.projectNumber,
      vesselName,
      voyageNumber,
      etd: etd?.toISOString(),
      eta: eta?.toISOString(),
      carrierId: matchedCarrierId,
      carrierName: carrierNameToStore,
    })

    // ============================================
    // Link document IMMEDIATELY after project creation
    // This prevents duplicate project creation on retry
    // ============================================
    document.relatedEntityType = 'fms_projects:fms_project'
    document.relatedEntityId = project.id
    await em.flush()

    logger.debug('document_linked_to_project', {
      documentId,
      projectId: project.id,
    })

    // ============================================
    // Skip placeholder container creation
    // Containers will be created by tracking import (syncShipmentsToProject)
    // which validates container numbers against ISO 6346 format
    // ============================================
    if (rawContainers.length > 0) {
      logger.debug('skipping_placeholder_containers', {
        documentId,
        projectId: project.id,
        containerCount: rawContainers.length,
        message: 'Containers will be created by tracking import with validated container numbers',
      })
    }

    // ============================================
    // Start tracking and sync containers
    // Uses the same pattern as import-tracking endpoint
    // ============================================
    let trackingStarted = false

    if (carrierCode && (bookingNumber || blNumber || containerNumbers.length > 0)) {
      try {
        const trackingService = resolve('shipmentTrackingService') as TrackingService

        // Prefer booking number, then BL number, then first container
        let referenceType: 'bol' | 'booking' | 'container'
        let referenceValue: string

        if (bookingNumber) {
          referenceType = 'booking'
          referenceValue = bookingNumber
        } else if (blNumber) {
          referenceType = 'bol'
          referenceValue = blNumber
        } else {
          referenceType = 'container'
          referenceValue = containerNumbers[0]
        }

        const trackingResult = await trackingService.createTrackingJob({
          organizationId,
          tenantId,
          carrierCode,
          referenceType,
          referenceValue,
        })

        logger.info('tracking_job_created', {
          documentId,
          projectId: project.id,
          trackingJobId: trackingResult.trackingJobId,
          shipmentsCreated: trackingResult.shipmentsCreated,
          newEvents: trackingResult.newEvents,
        })

        // Sync shipments to project (creates validated containers)
        // Also sync existing shipments when tracking job was reused (shipmentsCreated === 0)
        //
        // IMPORTANT: After this point, do NOT query containers or shipments using the
        // original `em` - they were created in `freshEm` and won't be visible.
        // Only modify entities already tracked by original `em` (like `document`).
        const freshEm = em.fork()
        const shipments = await freshEm.find(Shipment, {
          trackingJob: { id: trackingResult.trackingJobId },
          organizationId,
          tenantId,
          deletedAt: null,
        })

        if (shipments.length > 0) {
          // Reload project in fresh EM for sync
          const freshProject = await freshEm.findOneOrFail(FmsProject, { id: project.id })
          const syncResult = await syncShipmentsToProject(
            freshEm,
            shipments,
            freshProject,
            organizationId,
            tenantId
          )

          logger.info('containers_synced', {
            documentId,
            projectId: project.id,
            trackingJobId: trackingResult.trackingJobId,
            containersCreated: syncResult.containersCreated,
            containersUpdated: syncResult.containersUpdated,
            reusedExistingJob: trackingResult.shipmentsCreated === 0,
          })

          trackingStarted = true
        }
      } catch (error) {
        // Log but don't fail - tracking can be added manually
        logger.warn('tracking_failed', {
          documentId,
          projectId: project.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Find and link other matching documents
    // Note: Document was already linked immediately after project creation above
    const matchingDocIds = await findMatchingDocumentIds(
      em,
      {
        blNumber: blNumber || null,
        mblNumber: mblNumber || null,
        bookingNumber: bookingNumber || null,
        containerNumbers: containerNumbers.length > 0 ? containerNumbers : null,
      },
      {
        tenantId,
        organizationId,
        excludeDocumentId: documentId,
      }
    )

    if (matchingDocIds.length > 0) {
      await em.nativeUpdate(
        FmsDocument,
        { id: { $in: matchingDocIds } },
        {
          relatedEntityType: 'fms_projects:fms_project',
          relatedEntityId: project.id,
        }
      )

      logger.info('related_documents_linked', {
        documentId,
        projectId: project.id,
        linkedCount: matchingDocIds.length,
        linkedIds: matchingDocIds,
      })
    }

    logger.info('auto_create_completed', {
      documentId,
      projectId: project.id,
      projectNumber: project.projectNumber,
      documentsLinked: matchingDocIds.length + 1,
      trackingStarted,
      vesselName,
      voyageNumber,
      etd: etd?.toISOString(),
      eta: eta?.toISOString(),
      carrierId: matchedCarrierId,
      carrierName: carrierNameToStore,
    })
  } catch (error) {
    logger.error('auto_create_failed', error, { documentId })

    // Non-retryable errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('violates') ||
      errorMessage.includes('duplicate key')

    if (isNonRetryable) {
      logger.error('non_retryable_error', error, { documentId })
      return // Don't retry
    }

    throw error // Re-throw for queue retry
  }
}
