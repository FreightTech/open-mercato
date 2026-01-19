import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { EntityManager } from '@mikro-orm/postgresql'
import { ShipmentContainer } from '../../../data/entities'
import { createShipmentContainerSchema } from '../../../data/validators'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const paramsSchema = z.object({
    id: z.string().uuid(),
})

export const metadata = {
    GET: { requireAuth: true, requireFeatures: ['shipments.shipments.view'] },
    POST: { requireAuth: true, requireFeatures: ['shipments.shipments.edit'] },
}

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parse = paramsSchema.safeParse({ id: params.id })
    if (!parse.success) return NextResponse.json({ error: 'Invalid shipment id' }, { status: 400 })

    try {
        const container = await createRequestContainer()
        const em = container.resolve<EntityManager>('em')

        const containers = await em.find(ShipmentContainer, {
            shipment: parse.data.id,
        }, {
            orderBy: { createdAt: 'ASC' },
        })

        return NextResponse.json({ items: containers })
    } catch (error) {
        console.error('Failed to fetch containers:', error)
        return NextResponse.json(
            { error: 'Failed to fetch containers' },
            { status: 500 }
        )
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parseParams = paramsSchema.safeParse({ id: params.id })
    if (!parseParams.success) return NextResponse.json({ error: 'Invalid shipment id' }, { status: 400 })

    const body = await request.json()
    const parse = createShipmentContainerSchema.omit({ shipmentId: true }).safeParse(body)

    if (!parse.success) {
        return NextResponse.json(
            { error: 'Invalid request body', details: parse.error },
            { status: 400 }
        )
    }

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

    const tenantId = auth.actorTenantId || auth.tenantId
    const organizationId = auth.actorOrgId || auth.orgId

    if (!tenantId || !organizationId) {
        return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
    }

    const ctx: CommandRuntimeContext = {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: organizationId as string,
        organizationIds: scope?.filterIds ?? null,
        request,
    }

    const bus = new CommandBus()

    try {
        const { result } = await bus.execute<
            Record<string, unknown>,
            { id: string }
        >('shipments.containers.create', {
            input: {
                organizationId: organizationId as string,
                tenantId: tenantId as string,
                shipmentId: parseParams.data.id,
                ...parse.data,
            },
            ctx,
        })

        // Fetch created container
        const em = container.resolve<EntityManager>('em')
        const containerEntity = await em.findOne(ShipmentContainer, { id: result.id }, {
            populate: ['shipment']
        })

        return NextResponse.json(containerEntity)
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create container'
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
