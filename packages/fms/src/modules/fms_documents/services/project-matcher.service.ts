/**
 * Project Matcher Service
 *
 * Finds FMS projects that match a document based on shipping identifiers
 * (B/L number, booking number, container numbers).
 *
 * Used by:
 * - matched-projects API route
 * - auto-create-from-booking subscriber
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject, FmsSeaContainer } from '../../fms_projects/data/entities'

export interface ProjectMatchResult {
  projectId: string
  projectNumber: string
  clientName?: string | null
  currentStep?: string | null
  matchedBy: string[]
}

export interface MatchIdentifiers {
  blNumber?: string | null
  mblNumber?: string | null
  bookingNumber?: string | null
  containerNumbers?: string[] | null
}

/**
 * Normalizes identifier strings for comparison
 * - Trims whitespace
 * - Converts to uppercase
 * - Removes internal spaces
 */
function normalize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Finds all FMS projects that match the given identifiers
 *
 * Matching strategy:
 * 1. Match by project-level identifiers (blNumber, bookingNumber)
 * 2. Match by container-level identifiers (bolNumber, bookingNumber, containerNumber)
 *
 * Returns projects with reasons for each match.
 */
export async function findMatchingProjects(
  em: EntityManager,
  identifiers: MatchIdentifiers,
  scope: { tenantId: string; organizationId: string }
): Promise<ProjectMatchResult[]> {
  const { blNumber, mblNumber, bookingNumber, containerNumbers } = identifiers
  const { tenantId, organizationId } = scope

  // Normalize all identifiers
  const normalizedBl = normalize(blNumber)
  const normalizedMbl = normalize(mblNumber)
  const normalizedBooking = normalize(bookingNumber)
  const normalizedContainers = (containerNumbers || []).map(normalize).filter(Boolean)

  // If no identifiers, return empty
  if (!normalizedBl && !normalizedMbl && !normalizedBooking && normalizedContainers.length === 0) {
    return []
  }

  const matchedProjectIds = new Map<string, Set<string>>()

  function addMatch(projectId: string, reason: string) {
    if (!matchedProjectIds.has(projectId)) {
      matchedProjectIds.set(projectId, new Set())
    }
    matchedProjectIds.get(projectId)!.add(reason)
  }

  // 1. Match against FmsProject.blNumber and bookingNumber
  const projectConditions: Record<string, unknown>[] = []
  if (normalizedBl) {
    projectConditions.push({ blNumber: { $ilike: normalizedBl } })
  }
  if (normalizedMbl) {
    projectConditions.push({ blNumber: { $ilike: normalizedMbl } })
  }
  if (normalizedBooking) {
    projectConditions.push({ bookingNumber: { $ilike: normalizedBooking } })
  }

  if (projectConditions.length > 0) {
    const projects = await em.find(FmsProject, {
      $or: projectConditions,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    for (const project of projects) {
      const projBl = normalize(project.blNumber)
      const projBooking = normalize(project.bookingNumber)
      if (projBl && (projBl === normalizedBl || projBl === normalizedMbl)) {
        addMatch(project.id, 'blNumber')
      }
      if (projBooking && projBooking === normalizedBooking) {
        addMatch(project.id, 'bookingNumber')
      }
    }
  }

  // 2. Match against FmsSeaContainer fields
  const containerConditions: Record<string, unknown>[] = []
  if (normalizedBl) {
    containerConditions.push({ bolNumber: { $ilike: normalizedBl } })
  }
  if (normalizedMbl) {
    containerConditions.push({ bolNumber: { $ilike: normalizedMbl } })
  }
  if (normalizedBooking) {
    containerConditions.push({ bookingNumber: { $ilike: normalizedBooking } })
  }
  if (normalizedContainers.length > 0) {
    containerConditions.push({ containerNumber: { $in: normalizedContainers } })
  }

  if (containerConditions.length > 0) {
    const containers = await em.find(
      FmsSeaContainer,
      {
        $or: containerConditions,
        organizationId,
        tenantId,
        deletedAt: null,
      },
      { populate: ['project'] }
    )

    for (const container of containers) {
      if (!container.project) continue

      const projectId = container.project.id
      const containerNum = normalize(container.containerNumber)
      const containerBl = normalize(container.bolNumber)
      const containerBooking = normalize(container.bookingNumber)

      if (containerBl && (containerBl === normalizedBl || containerBl === normalizedMbl)) {
        addMatch(projectId, 'blNumber')
      }
      if (containerBooking && containerBooking === normalizedBooking) {
        addMatch(projectId, 'bookingNumber')
      }
      if (containerNum && normalizedContainers.includes(containerNum)) {
        addMatch(projectId, `containerNumber:${container.containerNumber}`)
      }
    }
  }

  if (matchedProjectIds.size === 0) {
    return []
  }

  // Load project details for all matched IDs
  const projectIds = Array.from(matchedProjectIds.keys())
  const projects = await em.find(
    FmsProject,
    {
      id: { $in: projectIds },
      organizationId,
      tenantId,
      deletedAt: null,
    },
    { populate: ['client'] }
  )

  return projects.map((project) => ({
    projectId: project.id,
    projectNumber: project.projectNumber,
    clientName: project.client?.name ?? null,
    currentStep: project.currentStep ?? null,
    matchedBy: Array.from(matchedProjectIds.get(project.id) || []),
  }))
}

/**
 * Finds all documents that match the given identifiers
 * Used to link existing documents to a newly created project
 */
export async function findMatchingDocumentIds(
  em: EntityManager,
  identifiers: MatchIdentifiers,
  scope: { tenantId: string; organizationId: string; excludeDocumentId?: string }
): Promise<string[]> {
  const { blNumber, mblNumber, bookingNumber, containerNumbers } = identifiers
  const { tenantId, organizationId, excludeDocumentId } = scope

  // Normalize all identifiers
  const normalizedBl = normalize(blNumber)
  const normalizedMbl = normalize(mblNumber)
  const normalizedBooking = normalize(bookingNumber)
  const normalizedContainers = (containerNumbers || []).map(normalize).filter(Boolean)

  if (!normalizedBl && !normalizedMbl && !normalizedBooking && normalizedContainers.length === 0) {
    return []
  }

  // Build conditions - use raw query for JSONB array matching
  const conn = em.getConnection()

  // Build WHERE clauses
  const whereClauses: string[] = []
  const params: unknown[] = []

  if (normalizedBl) {
    whereClauses.push('UPPER(TRIM(bl_number)) = ?')
    params.push(normalizedBl)
  }
  if (normalizedMbl) {
    whereClauses.push('UPPER(TRIM(mbl_number)) = ?')
    params.push(normalizedMbl)
  }
  if (normalizedBooking) {
    whereClauses.push('UPPER(TRIM(booking_number)) = ?')
    params.push(normalizedBooking)
  }

  // For container numbers, check JSONB array overlap
  if (normalizedContainers.length > 0) {
    // Convert container numbers to JSON array for comparison
    const containerArray = JSON.stringify(normalizedContainers)
    whereClauses.push(`(
      SELECT bool_or(UPPER(TRIM(elem::text)) = ANY(?::text[]))
      FROM jsonb_array_elements_text(COALESCE(container_numbers, '[]'::jsonb)) elem
    )`)
    params.push(normalizedContainers)
  }

  if (whereClauses.length === 0) {
    return []
  }

  // Build full query
  let query = `
    SELECT id FROM fms_documents
    WHERE tenant_id = ? AND organization_id = ?
    AND deleted_at IS NULL
    AND related_entity_id IS NULL
    AND (${whereClauses.join(' OR ')})
  `
  const queryParams = [tenantId, organizationId, ...params]

  if (excludeDocumentId) {
    query += ' AND id != ?'
    queryParams.push(excludeDocumentId)
  }

  const results = await conn.execute<Array<{ id: string }>>(query, queryParams)
  return results.map((r) => r.id)
}
