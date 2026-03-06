import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument } from '../../../../data/entities'
import { findMatchingProjects } from '../../../../services/project-matcher.service'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.view'] },
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

    const document = await em.findOne(FmsDocument, {
      id: parse.data.id,
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      deletedAt: null,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Use the project matcher service to find matching projects
    const matches = await findMatchingProjects(
      em,
      {
        blNumber: document.blNumber,
        mblNumber: document.mblNumber,
        bookingNumber: document.bookingNumber,
        containerNumbers: document.containerNumbers,
      },
      {
        tenantId: tenantId as string,
        organizationId: organizationId as string,
      }
    )

    return NextResponse.json({ matches })
  } catch (error: unknown) {
    console.error('[fms-documents:matched-projects] error:', error)
    return NextResponse.json({ error: 'Failed to find matching projects' }, { status: 500 })
  }
}
