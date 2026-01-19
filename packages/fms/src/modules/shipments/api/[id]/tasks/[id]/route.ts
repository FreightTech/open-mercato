// PUT /api/shipments/tasks/[id]
// DELETE /api/shipments/tasks/[id]
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestContainer } from '@/lib/di/container';
import { getAuthFromRequest } from '@/lib/auth/server';
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope';
import { EntityManager } from '@mikro-orm/postgresql';
import { ShipmentTask, TaskStatus } from '../../../../data/entities';
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus';
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands';
// Import to register commands
import '../../../../commands';

const paramsSchema = z.object({
    id: z.string().uuid(),
});

const updateTaskSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional().nullable(),
    status: z.nativeEnum(TaskStatus).optional(),
    assignedToId: z.string().uuid().optional().nullable(),
});

export const metadata = {
    PUT: { requireAuth: true, requireFeatures: ['shipments.shipments.edit'] },
    DELETE: { requireAuth: true, requireFeatures: ['shipments.shipments.edit'] },
};

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await getAuthFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parse = paramsSchema.safeParse({ id: params.id });
    if (!parse.success) return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });

    const body = await request.json();
    const validation = updateTaskSchema.safeParse(body);
    if (!validation.success) {
        return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 });
    }

    const container = await createRequestContainer();
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request });

    const organizationId = auth.actorOrgId || auth.orgId;

    const runtimeCtx: CommandRuntimeContext = {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: organizationId as string,
        organizationIds: scope?.filterIds ?? null,
        request,
    };

    const bus = new CommandBus();

    try {
        const { result } = await bus.execute<
            Record<string, unknown>,
            { id: string }
        >('shipments.tasks.update', {
            input: {
                id: parse.data.id,
                ...validation.data,
            },
            ctx: runtimeCtx,
        });

        // Fetch updated task to return
        const em = container.resolve<EntityManager>('em');
        const task = await em.findOne(ShipmentTask, { id: result.id }, {
            populate: ['assignedTo']
        });

        return NextResponse.json({
            ok: true,
            item: task,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update task';
        const status = message.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await getAuthFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parse = paramsSchema.safeParse({ id: params.id });
    if (!parse.success) return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });

    const container = await createRequestContainer();
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request });

    const organizationId = auth.actorOrgId || auth.orgId;

    const runtimeCtx: CommandRuntimeContext = {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: organizationId as string,
        organizationIds: scope?.filterIds ?? null,
        request,
    };

    const bus = new CommandBus();

    try {
        await bus.execute<{ id: string }, { id: string }>('shipments.tasks.delete', {
            input: { id: parse.data.id },
            ctx: runtimeCtx,
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete task';
        const status = message.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}
