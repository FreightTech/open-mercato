import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefXmlService } from '../../../services/xml.service'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['ksef.submit'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: invoiceId } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  try {
    const xmlService = new KsefXmlService()
    const xml = await xmlService.generateFa3Xml(em, invoiceId)

    return NextResponse.json({
      invoiceId,
      xml,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate XML'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Generate XML',
  methods: {
    POST: {
      summary: 'Generate FA(3) XML for an invoice',
      description: 'Preview the FA(3) XML that would be submitted to KSeF for the specified invoice',
    },
  },
}
