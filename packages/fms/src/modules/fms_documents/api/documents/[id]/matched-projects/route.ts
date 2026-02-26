import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument } from '../../../../data/entities'
import { FmsProject, FmsSeaContainer } from '../../../../../fms_projects/data/entities'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.view'] },
}

function normalize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const parse = paramsSchema.safeParse({ id: params.id })
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 })
  }

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')

    const tenantId = auth.actorTenantId || auth.tenantId
    const organizationId = auth.actorOrgId || auth.orgId

    const document = await em.findOne(FmsDocument, {
      id: parse.data.id,
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Collect normalized identifiers from the document
    const docBlNumber = normalize(document.blNumber)
    const docMblNumber = normalize(document.mblNumber)
    const docBookingNumber = normalize(document.bookingNumber)
    const docContainerNumbers = (document.containerNumbers || [])
      .map(normalize)
      .filter(Boolean)

    // If no identifiers populated, return empty
    if (!docBlNumber && !docMblNumber && !docBookingNumber && docContainerNumbers.length === 0) {
      return NextResponse.json({ matches: [] })
    }

    const matchedProjectIds = new Map<string, Set<string>>()

    function addMatch(projectId: string, reason: string) {
      if (!matchedProjectIds.has(projectId)) {
        matchedProjectIds.set(projectId, new Set())
      }
      matchedProjectIds.get(projectId)!.add(reason)
    }

    // 1. Match against FmsProject.blNumber and bookingNumber
    const blOrBookingConditions: Record<string, unknown>[] = []
    if (docBlNumber) {
      blOrBookingConditions.push({ blNumber: { $ilike: docBlNumber } })
    }
    if (docMblNumber) {
      blOrBookingConditions.push({ blNumber: { $ilike: docMblNumber } })
    }
    if (docBookingNumber) {
      blOrBookingConditions.push({ bookingNumber: { $ilike: docBookingNumber } })
    }

    if (blOrBookingConditions.length > 0) {
      const projects = await em.find(FmsProject, {
        $or: blOrBookingConditions,
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        deletedAt: null,
      })

      for (const project of projects) {
        const projBl = normalize(project.blNumber)
        const projBooking = normalize(project.bookingNumber)
        if (projBl && (projBl === docBlNumber || projBl === docMblNumber)) {
          addMatch(project.id, 'blNumber')
        }
        if (projBooking && projBooking === docBookingNumber) {
          addMatch(project.id, 'bookingNumber')
        }
      }
    }

    // 2. Match against FmsSeaContainer fields
    const containerConditions: Record<string, unknown>[] = []
    if (docBlNumber) {
      containerConditions.push({ blNumber: { $ilike: docBlNumber } })
    }
    if (docMblNumber) {
      containerConditions.push({ blNumber: { $ilike: docMblNumber } })
    }
    if (docBookingNumber) {
      containerConditions.push({ bookingNumber: { $ilike: docBookingNumber } })
    }
    if (docContainerNumbers.length > 0) {
      containerConditions.push({ containerNumber: { $in: docContainerNumbers } })
    }

    if (containerConditions.length > 0) {
      const containers = await em.find(
        FmsSeaContainer,
        {
          $or: containerConditions,
          organizationId: organizationId as string,
          tenantId: tenantId as string,
        },
        { populate: ['project'] }
      )

      for (const container of containers) {
        const projectId = container.project.id
        const containerNum = normalize(container.containerNumber)
        const containerBl = normalize(container.bolNumber)
        const containerBooking = normalize(container.bookingNumber)

        if (containerBl && (containerBl === docBlNumber || containerBl === docMblNumber)) {
          addMatch(projectId, 'blNumber')
        }
        if (containerBooking && containerBooking === docBookingNumber) {
          addMatch(projectId, 'bookingNumber')
        }
        if (containerNum && docContainerNumbers.includes(containerNum)) {
          addMatch(projectId, `containerNumber:${container.containerNumber}`)
        }
      }
    }

    if (matchedProjectIds.size === 0) {
      return NextResponse.json({ matches: [] })
    }

    // Load project details for all matched IDs
    const projectIds = Array.from(matchedProjectIds.keys())
    const projects = await em.find(FmsProject, {
      id: { $in: projectIds },
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      deletedAt: null,
    }, { populate: ['client'] })

    const matches = projects.map((project) => ({
      projectId: project.id,
      projectNumber: project.projectNumber,
      clientName: project.client?.name ?? null,
      currentStep: project.currentStep ?? null,
      matchedBy: Array.from(matchedProjectIds.get(project.id) || []),
    }))

    return NextResponse.json({ matches })
  } catch (error: any) {
    console.error('[fms-documents:matched-projects] error:', error)
    return NextResponse.json({ error: 'Failed to find matching projects' }, { status: 500 })
  }
}
