import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { Shipment } from '../../data/entities'
import { updateShipmentSchema } from '../../data/validators'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../commands'

const paramsSchema = z.object({
    id: z.uuid(),
})

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parse = paramsSchema.safeParse({ id: ctx.params?.id })
    if (!parse.success) return NextResponse.json({ error: 'Invalid shipment id' }, { status: 400 })

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const em = container.resolve('em') as EntityManager

    const shipment = await em.findOne(Shipment, { id: parse.data.id }, {
        populate: ['client', 'createdBy', 'assignedTo', 'contactPerson', 'shipper', 'consignee']
    })

    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })

    if (auth.tenantId && shipment.tenantId !== auth.tenantId) {
        return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    const allowedOrgIds = new Set<string>()
    if (scope?.filterIds?.length) scope.filterIds.forEach((id) => allowedOrgIds.add(id))
    else if (auth.orgId) allowedOrgIds.add(auth.orgId)

    if (allowedOrgIds.size && shipment.organizationId && !allowedOrgIds.has(shipment.organizationId)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json(shipment)
}

export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parse = paramsSchema.safeParse({ id: ctx.params?.id })
    if (!parse.success) return NextResponse.json({ error: 'Invalid shipment id' }, { status: 400 })

    const body = await req.json()
    const validation = updateShipmentSchema.safeParse(body)
    if (!validation.success) {
        return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
    }

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })

    const organizationId = auth.actorOrgId || auth.orgId

    const runtimeCtx: CommandRuntimeContext = {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: organizationId as string,
        organizationIds: scope?.filterIds ?? null,
        request: req,
    }

    const bus = new CommandBus()

    try {
        const { result } = await bus.execute<
            Record<string, unknown>,
            { id: string }
        >('shipments.shipments.update', {
            input: {
                id: parse.data.id,
                ...validation.data,
            },
            ctx: runtimeCtx,
        })

        // Fetch updated shipment to return with populated relations
        const em = container.resolve('em') as EntityManager
        const shipment = await em.findOne(Shipment, { id: result.id }, {
            populate: ['client', 'createdBy', 'assignedTo', 'contactPerson', 'shipper', 'consignee']
        })

        // Trigger tracking registration after update
        try {
            const trackingBus = container.resolve<CommandBus>('commandBus')
            await trackingBus.execute('fms_tracking.tracking.register', {
                ctx: runtimeCtx,
                input: {
                    organizationId: shipment?.organizationId,
                    tenantId: shipment?.tenantId,
                    bookingNumber: shipment?.bookingNumber,
                    carrierCode: shipment?.carrier,
                }
            })
        } catch {
            // Tracking registration is optional, don't fail the update
        }

        return NextResponse.json(shipment)
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update shipment'
        const status = message.includes('not found') ? 404 : 400
        return NextResponse.json({ error: message }, { status })
    }
}

export async function DELETE(_req: Request, ctx: { params?: { id?: string } }) {
    const auth = await getAuthFromRequest(_req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parse = paramsSchema.safeParse({ id: ctx.params?.id })
    if (!parse.success) return NextResponse.json({ error: 'Invalid shipment id' }, { status: 400 })

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: _req })

    const organizationId = auth.actorOrgId || auth.orgId

    const runtimeCtx: CommandRuntimeContext = {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: organizationId as string,
        organizationIds: scope?.filterIds ?? null,
        request: _req,
    }

    const bus = new CommandBus()

    try {
        await bus.execute<{ id: string }, { id: string }>('shipments.shipments.delete', {
            input: { id: parse.data.id },
            ctx: runtimeCtx,
        })

        return NextResponse.json({ success: true })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete shipment'
        const status = message.includes('not found') ? 404 : 400
        return NextResponse.json({ error: message }, { status })
    }
}