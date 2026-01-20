//@ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { Shipment } from '../data/entities'
import { createShipmentSchema, queryShipmentSchema } from '../data/validators'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { QueryEngine } from '@open-mercato/core/modules/query_index/lib/types'
import { E as ES } from '../../../../generated/entities.ids.generated'
import * as FS from '../../../../generated/entities/shipment'
// Import to register commands
import '../commands'

export const metadata = {
    GET: { requireAuth: true, requireFeatures: ['shipments.shipments.view'] },
    POST: { requireAuth: true, requireFeatures: ['shipments.shipments.create'] },
}

// Field mapping from frontend camelCase to backend FS constants
const FIELD_MAP: Record<string, any> = {
    internalReference: FS.internal_reference,
    bookingNumber: FS.booking_number,
    bolNumber: FS.bol_number,
    containerNumber: FS.container_number,
    containerType: FS.container_type,
    status: FS.status,
    carrier: FS.carrier,
    originPort: FS.origin_port,
    originLocation: FS.origin_location,
    destinationPort: FS.destination_port,
    destinationLocation: FS.destination_location,
    etd: FS.etd,
    atd: FS.atd,
    eta: FS.eta,
    ata: FS.ata,
    mode: FS.mode,
    incoterms: FS.incoterms,
    weight: FS.weight,
    volume: FS.volume,
    totalPieces: FS.total_pieces,
    totalVolume: FS.total_volume,
    amount: FS.amount,
    vesselName: FS.vessel_name,
    voyageNumber: FS.voyage_number,
    requestDate: FS.request_date,
    createdAt: FS.created_at,
    updatedAt: FS.updated_at,
}

// Parse DynamicTable FilterRow into query engine filter format
function parseFilterRow(row: { field: string; operator: string; values: any[] }): any | null {
    const field = FIELD_MAP[row.field]
    if (!field) return null

    switch (row.operator) {
        case 'is_any_of':
            return { field, op: 'in', value: row.values }
        case 'is_not_any_of':
            return { field, op: 'nin', value: row.values }
        case 'contains':
            return { field, op: 'ilike', value: `%${row.values[0] || ''}%` }
        case 'is_empty':
            return { field, op: 'eq', value: null }
        case 'is_not_empty':
            return { field, op: 'ne', value: null }
        case 'equals':
            return { field, op: 'eq', value: row.values[0] }
        case 'not_equals':
            return { field, op: 'ne', value: row.values[0] }
        case 'greater_than':
            return { field, op: 'gt', value: row.values[0] }
        case 'less_than':
            return { field, op: 'lt', value: row.values[0] }
        case 'greater_than_or_equal':
            return { field, op: 'gte', value: row.values[0] }
        case 'less_than_or_equal':
            return { field, op: 'lte', value: row.values[0] }
        case 'is_true':
            return { field, op: 'eq', value: true }
        case 'is_false':
            return { field, op: 'eq', value: false }
        default:
            return null
    }
}

function buildScopeFilters(
    auth: { tenantId?: string | null; orgId?: string | null; actorTenantId?: string | null; actorOrgId?: string | null },
    scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null } | null
): { tenantId?: string; organizationIds?: string[] } {
    const result: { tenantId?: string; organizationIds?: string[] } = {}

    const tenantId = auth.actorTenantId || auth.tenantId
    if (typeof tenantId === 'string') {
        result.tenantId = tenantId
    }

    const allowedOrgIds = new Set<string>()
    const filterIds = scope?.filterIds
    if (Array.isArray(filterIds) && filterIds.length > 0) {
        filterIds.forEach((id) => {
            if (typeof id === 'string') allowedOrgIds.add(id)
        })
    } else {
        const fallbackOrgId = scope?.selectedId ?? auth.actorOrgId ?? auth.orgId
        if (typeof fallbackOrgId === 'string') {
            allowedOrgIds.add(fallbackOrgId)
        }
    }

    if (allowedOrgIds.size > 0) {
        result.organizationIds = [...allowedOrgIds]
    }

    return result
}

export async function GET(request: NextRequest) {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const query: Record<string, string | undefined> = {}
    url.searchParams.forEach((value, key) => {
        query[key] = value
    })

    const parse = queryShipmentSchema.safeParse(query)
    if (!parse.success) {
        return NextResponse.json(
            { error: 'Invalid query parameters', details: parse.error },
            { status: 400 }
        )
    }

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const queryEngine = container.resolve('queryEngine') as QueryEngine
    const em = container.resolve('em') as EntityManager

    const scopeFilters = buildScopeFilters(auth, scope)

    // Build filters for data engine
    const filters: any[] = []

    // Parse DynamicTable FilterRow[] format
    if (parse.data.filters && Array.isArray(parse.data.filters)) {
        for (const row of parse.data.filters) {
            const filter = parseFilterRow(row)
            if (filter) {
                filters.push(filter)
            }
        }
    }

    // Legacy filter support
    if (parse.data.status) {
        filters.push({ field: FS.status, op: 'eq', value: parse.data.status })
    }

    if (parse.data.containerType) {
        filters.push({ field: FS.container_type, op: 'eq', value: parse.data.containerType })
    }

    if (parse.data.clientId) {
        filters.push({ field: FS.client, op: 'eq', value: parse.data.clientId })
    }

    if (parse.data.assignedToId) {
        filters.push({ field: FS.assigned_to, op: 'eq', value: parse.data.assignedToId })
    }

    // Global search
    if (parse.data.search) {
        filters.push({
            op: 'or',
            filters: [
                { field: FS.internal_reference, op: 'ilike', value: `%${parse.data.search}%` },
                { field: FS.booking_number, op: 'ilike', value: `%${parse.data.search}%` },
                { field: FS.container_number, op: 'ilike', value: `%${parse.data.search}%` },
                { field: FS.bol_number, op: 'ilike', value: `%${parse.data.search}%` },
                { field: FS.carrier, op: 'ilike', value: `%${parse.data.search}%` },
            ]
        })
    }

    // Build sort
    const sortFieldMap: Record<string, any> = {
        createdAt: FS.created_at,
        updatedAt: FS.updated_at,
        eta: FS.eta,
        etd: FS.etd,
        ata: FS.ata,
        atd: FS.atd
    }

    const result = await queryEngine.query(ES.shipments.shipment, {
        tenantId: scopeFilters.tenantId,
        organizationId: scopeFilters.organizationIds?.[0] ?? undefined,
        filters,
        page: { page: parse.data.page, pageSize: parse.data.pageSize },
        sort: { field: sortFieldMap[parse.data.sortField || 'createdAt'] || FS.created_at, dir: parse.data.sortDir || 'desc' },
    })

    // Enhance items with related data
    const items = Array.isArray(result.items) ? result.items : []
    if (items.length) {
        const companyIds = new Set<string>()
        const userIds = new Set<string>()

        items.forEach((item: any) => {
            if (item.client_id) companyIds.add(item.client_id)
            if (item.created_by_id) userIds.add(item.created_by_id)
            if (item.assigned_to_id) userIds.add(item.assigned_to_id)
        })

        const [companies, users] = await Promise.all([
            companyIds.size ? em.find('Contractor', { id: { $in: Array.from(companyIds) } }) : [],
            userIds.size ? em.find('User', { id: { $in: Array.from(userIds) } }) : [],
        ])

        const companyMap = new Map(companies.map((c: any) => [c.id, c]))
        const userMap = new Map(users.map((u: any) => [u.id, u]))

        result.items = items.map((item: any) => {
            const client = item.client_id ? companyMap.get(item.client_id) : null
            const createdBy = item.created_by_id ? userMap.get(item.created_by_id) : null
            const assignedTo = item.assigned_to_id ? userMap.get(item.assigned_to_id) : null

            return {
                ...item,
                bookingNumber: item.booking_number,
                containerNumber: item.container_number,
                internalReference: item.internal_reference,
                client: client ? {
                    id: client.id,
                    display_name: client.displayName,
                    primary_email: client.primaryEmail,
                } : null,
                createdBy: createdBy ? {
                    id: createdBy.id,
                    email: createdBy.email,
                    display_name: createdBy.displayName,
                } : null,
                assignedTo: assignedTo ? {
                    id: assignedTo.id,
                    email: assignedTo.email,
                    display_name: assignedTo.displayName,
                } : null,
            }
        })
    }

    return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parse = createShipmentSchema.safeParse(body)

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
        >('shipments.shipments.create', {
            input: {
                organizationId: organizationId as string,
                tenantId: tenantId as string,
                ...parse.data,
            },
            ctx,
        })

        // Fetch created shipment with relations
        const em = container.resolve('em') as EntityManager
        const shipment = await em.findOne(Shipment, { id: result.id }, {
            populate: ['client', 'createdBy', 'assignedTo']
        })

        return NextResponse.json(shipment)
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create shipment'
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
