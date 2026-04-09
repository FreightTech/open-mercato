/**
 * Matched Projects Route
 *
 * FLAG: This route imports from fms_projects (FMS-specific module).
 * The project-matcher service depends on FmsProject and FmsSeaContainer entities.
 * This route should remain in the FMS package or the project-matcher service
 * needs to be abstracted to work with a generic project interface.
 *
 * For now, this is a placeholder that returns an empty matches array.
 * The FMS package should provide this route via widget injection or
 * API interceptor pattern.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { Document } from '../../../../data/entities'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['documents.view'] },
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

    if (!tenantId || !organizationId) {
      return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 401 })
    }

    const document = await em.findOne(Document, {
      id: parse.data.id,
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Project matching is FMS-specific (depends on FmsProject/FmsSeaContainer entities).
    // The FMS package can override this route via API interceptor to provide actual matching.
    return NextResponse.json({ matches: [] })
  } catch (error: unknown) {
    console.error('[documents:matched-projects] error:', error)
    return NextResponse.json({ error: 'Failed to find matching projects' }, { status: 500 })
  }
}
