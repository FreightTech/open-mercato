import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, ConsistencyCheck } from '../../../../../data/entities'
import { consistencyOpenApi } from '../../../../../api/openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs.view'] },
}

export const openApi = consistencyOpenApi

export async function GET(req: Request, context: { params: Record<string, string> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shipmentId = context.params.id
  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  const findFilter: Record<string, unknown> = {
    id: shipmentId,
    tenantId: auth.tenantId,
  }
  if (auth.orgId) findFilter.organizationId = auth.orgId

  const shipment = await em.findOne(CustomsShipment, findFilter)

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
  }

  const checks = await em.find(ConsistencyCheck, { shipment }, {
    orderBy: { status: 'asc' } as never,
  })

  // Sort: mismatches first, then missing, then ok
  const statusOrder: Record<string, number> = { mismatch: 0, missing: 1, ok: 2 }
  const sorted = [...checks].sort(
    (checkA, checkB) => (statusOrder[checkA.status] ?? 3) - (statusOrder[checkB.status] ?? 3),
  )

  return NextResponse.json({
    checks: sorted.map((check) => ({
      id: check.id,
      field: check.field,
      label: check.label,
      sourceDoc1: check.sourceDoc1,
      sourceDoc2: check.sourceDoc2,
      value1: check.value1,
      value2: check.value2,
      status: check.status,
      discrepancy: check.discrepancy ?? null,
    })),
  })
}
