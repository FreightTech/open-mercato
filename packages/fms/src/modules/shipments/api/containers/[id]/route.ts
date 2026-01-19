import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { EntityManager } from '@mikro-orm/postgresql'
import { ShipmentContainer } from '../../../data/entities'
import { updateShipmentContainerSchema } from '../../../data/validators'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const paramsSchema = z.object({
    id: z.string().uuid(),
})

export const metadata = {
    GET: { requireAuth: true, requireFeatures: ['shipments.shipments.view'] },
    PUT: { requireAuth: true, requireFeatures: ['shipments.shipments.edit'] },
    DELETE: { requireAuth: true, requireFeatures: ['shipments.shipments.delete'] },
}

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parse = paramsSchema.safeParse({ id: params.id })
    if (!parse.success) return NextResponse.json({ error: 'Invalid container id' }, { status: 400 })

    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')

    const containerEntity = await em.findOne(ShipmentContainer, { id: parse.data.id }, {
        populate: ['shipment']
    })

    if (!containerEntity) return NextResponse.json({ error: 'Container not found' }, { status: 404 })

    return NextResponse.json(containerEntity)
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parse = paramsSchema.safeParse({ id: params.id })
    if (!parse.success) return NextResponse.json({ error: 'Invalid container id' }, { status: 400 })

    const body = await request.json()
    const validation = updateShipmentContainerSchema.safeParse(body)
    if (!validation.success) {
        return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
    }

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

    const organizationId = auth.actorOrgId || auth.orgId

    const runtimeCtx: CommandRuntimeContext = {
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
        >('shipments.containers.update', {
            input: {
                id: parse.data.id,
                ...validation.data,
            },
            ctx: runtimeCtx,
        })

        // Fetch updated container to return
        const em = container.resolve<EntityManager>('em')
        const containerEntity = await em.findOne(ShipmentContainer, { id: result.id }, {
            populate: ['shipment']
        })

        return NextResponse.json(containerEntity)
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update container'
        const status = message.includes('not found') ? 404 : 400
        return NextResponse.json({ error: message }, { status })
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parse = paramsSchema.safeParse({ id: params.id })
    if (!parse.success) return NextResponse.json({ error: 'Invalid container id' }, { status: 400 })

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

    const organizationId = auth.actorOrgId || auth.orgId

    const runtimeCtx: CommandRuntimeContext = {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: organizationId as string,
        organizationIds: scope?.filterIds ?? null,
        request,
    }

    const bus = new CommandBus()

    try {
        await bus.execute<{ id: string }, { id: string }>('shipments.containers.delete', {
            input: { id: parse.data.id },
            ctx: runtimeCtx,
        })

        return NextResponse.json({ success: true })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete container'
        const status = message.includes('not found') ? 404 : 400
        return NextResponse.json({ error: message }, { status })
    }
}
