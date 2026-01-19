// GET /api/shipments/documents/[id] - Get a specific document
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestContainer } from '@/lib/di/container';
import { getAuthFromRequest } from '@/lib/auth/server';
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope';
import { EntityManager } from '@mikro-orm/postgresql';
import { ShipmentDocument } from '../../../../data/entities';
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities';
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus';
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands';
// Import to register commands
import '../../../../commands';

const paramsSchema = z.object({
    id: z.string().uuid(),
});

export const metadata = {
    GET: { requireAuth: true, requireFeatures: ['shipments.shipments.view'] },
    DELETE: { requireAuth: true, requireFeatures: ['shipments.shipments.delete'] },
};

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const documentId = params.id;
        const container = await createRequestContainer();
        const em = container.resolve<EntityManager>('em');
        const auth = await getAuthFromRequest(request);

        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const document = await em.findOne(ShipmentDocument, {
            id: documentId,
            tenantId: auth.actorTenantId as string,
            organizationId: auth.actorOrgId as string,
        });

        if (!document) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        // Fetch attachment details
        const attachment = await em.findOne(Attachment, {
            id: document.attachmentId,
        });

        return NextResponse.json({
            ok: true,
            item: {
                id: document.id,
                shipmentId: document.shipmentId,
                attachmentId: document.attachmentId,
                extractedData: document.extractedData,
                processedAt: document.processedAt,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt,
                attachment: attachment
                    ? {
                        id: attachment.id,
                        fileName: attachment.fileName,
                        mimeType: attachment.mimeType,
                        fileSize: attachment.fileSize,
                        url: attachment.url,
                    }
                    : null,
            },
        });
    } catch (error: any) {
        console.error('[ShipmentDocuments] Get error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await getAuthFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parse = paramsSchema.safeParse({ id: params.id });
    if (!parse.success) return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });

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
        await bus.execute<{ id: string }, { id: string }>('shipments.documents.delete', {
            input: { id: parse.data.id },
            ctx: runtimeCtx,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete document';
        const status = message.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}