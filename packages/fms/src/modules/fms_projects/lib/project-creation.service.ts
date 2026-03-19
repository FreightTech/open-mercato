/**
 * Project Creation Service
 *
 * Handles FmsProject creation from extracted booking data,
 * including project number generation with collision retry logic.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject } from '../data/entities'
import { Contractor } from '../../contractors/data/entities'
import { FmsCarrier } from '../../fms_products/data/entities'
import type { ExtractedBookingData } from '../data/types'
import { createFmsLogger } from '../../../lib/logger'

const logger = createFmsLogger('fms_projects.project_creation')

/**
 * Input for creating a project from booking data.
 */
export interface CreateProjectInput {
  organizationId: string
  tenantId: string
  extractedData: ExtractedBookingData
  clientId: string | null
  carrierId: string | null
}

/**
 * Result of project creation.
 */
export interface CreateProjectResult {
  project: FmsProject
  projectNumber: string
}

/**
 * Maximum number of retries for project number collision.
 */
export const MAX_PROJECT_CREATION_RETRIES = 3

/**
 * Generates a simplified project number for sea imports.
 * Format: IMP/SEA/{SEQUENCE}/{YEAR}
 *
 * @param em - Entity manager for database queries
 * @param tenantId - Tenant ID for scoping
 * @param organizationId - Organization ID for scoping
 * @returns Generated project number
 */
export async function generateSimplifiedProjectNumber(
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
 * Checks if an error is a duplicate key/unique constraint violation.
 *
 * @param error - The error to check
 * @returns True if it's a duplicate key error
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false
  }

  const errorMessage = error instanceof Error ? error.message : String(error)
  const hasMessageMatch =
    errorMessage.includes('duplicate key') ||
    errorMessage.includes('unique constraint') ||
    errorMessage.includes('violates unique')

  if (hasMessageMatch) {
    return true
  }

  // Check PostgreSQL error code
  if (typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === '23505'
  }

  return false
}

/**
 * Creates an FmsProject from extracted booking data.
 *
 * Handles:
 * - Project number generation
 * - Retry on project number collision
 * - Setting all project fields from extracted data
 *
 * @param em - Entity manager for database operations
 * @param input - Project creation input
 * @returns Created project and its number
 */
export async function createProjectFromBookingData(
  em: EntityManager,
  input: CreateProjectInput
): Promise<CreateProjectResult> {
  const { organizationId, tenantId, extractedData, clientId, carrierId } = input
  const now = new Date()

  // Generate initial project number
  let projectNumber = await generateSimplifiedProjectNumber(em, tenantId, organizationId)
  let project: FmsProject | undefined

  for (let attempt = 0; attempt < MAX_PROJECT_CREATION_RETRIES; attempt++) {
    try {
      // Regenerate project number on retry (in case of collision)
      if (attempt > 0) {
        projectNumber = await generateSimplifiedProjectNumber(em, tenantId, organizationId)
      }

      project = em.create(FmsProject, {
        organizationId,
        tenantId,
        projectNumber,
        shipmentType: 'IMP', // Import for booking confirmations
        direction: 'import',
        cargoType: 'fcl', // Default to FCL for sea
        transportModes: ['sea'],

        // Client
        client: clientId ? em.getReference(Contractor, clientId) : null,

        // Identifiers
        bookingNumber: extractedData.bookingNumber || null,
        blNumber: extractedData.blNumber || extractedData.mblNumber || null,

        // Carrier info (use reference if matched)
        carrier: carrierId ? em.getReference(FmsCarrier, carrierId) : null,

        // Note: vesselName, voyageNumber, carrierName belong to FmsProjectLeg, not FmsProject
        // These will be populated when a leg is created or via tracking sync

        // Dates
        etd: extractedData.etd,
        eta: extractedData.eta,
        vgmCutoffDate: extractedData.vgmCutoffDate,
        docCutoffDate: extractedData.docCutoffDate,
        gateCloseDate: extractedData.gateCloseDate,

        // Routing (text addresses - user can manually select locations later)
        originAddress: extractedData.portOfLoading || null,
        destinationAddress: extractedData.portOfDischarge || null,
        // Note: originLocation and destinationLocation are relations, set to null
        // User can manually select locations later via entity search
        originLocation: null,
        destinationLocation: null,

        // Cargo
        commodityDescription: extractedData.commodityDescription || null,
        containerCount:
          extractedData.containerNumbers.length || extractedData.rawContainers.length || null,

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
      if (isDuplicateKeyError(error) && attempt < MAX_PROJECT_CREATION_RETRIES - 1) {
        logger.warn('project_number_collision_retry', {
          attempt: attempt + 1,
          maxRetries: MAX_PROJECT_CREATION_RETRIES,
          projectNumber,
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
  if (!project) {
    throw new Error('Failed to create project after maximum retries')
  }

  logger.info('project_created', {
    projectId: project.id,
    projectNumber: project.projectNumber,
    clientId,
    carrierId,
    bookingNumber: extractedData.bookingNumber,
    blNumber: extractedData.blNumber,
  })

  return { project, projectNumber: project.projectNumber }
}
