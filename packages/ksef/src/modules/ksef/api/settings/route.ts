import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { ksefLogger as logger } from '../../lib/observability'

const CONFIG_MODULE_ID = 'ksef'
const CONFIG_NAME = 'receive_sync_settings'
const SCHEDULE_ID_PREFIX = 'ksef-receive-sync'
const SCHEDULE_ID_NAMESPACE = '8a7b4c3d-9e1f-4a2b-b5c6-d7e8f9a0b1c2'

function uuidV5(name: string, namespace: string): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const nameBytes = Buffer.from(name, 'utf8')
  const digest = createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest()
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function buildScheduleId(tenantId: string): string {
  return uuidV5(`${SCHEDULE_ID_PREFIX}:${tenantId}`, SCHEDULE_ID_NAMESPACE)
}

const syncSettingsSchema = z.object({
  syncEnabled: z.boolean(),
  syncIntervalMinutes: z.number().int().min(15).max(1440),
  lastSyncAt: z.string().nullable().optional(),
})

type SyncSettings = z.infer<typeof syncSettingsSchema>

const defaultSettings: SyncSettings = {
  syncEnabled: false,
  syncIntervalMinutes: 60,
  lastSyncAt: null,
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ksef.settings.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['ksef.settings.manage'] },
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  const container = await createRequestContainer()

  type ConfigService = { getValue<T>(moduleId: string, name: string, options?: { defaultValue?: T | null }): Promise<T | null> }
  const configService = container.resolve('moduleConfigService') as ConfigService

  const stored = await configService.getValue<SyncSettings>(CONFIG_MODULE_ID, CONFIG_NAME)

  return NextResponse.json({
    ...defaultSettings,
    ...stored,
  })
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  const organizationId = (auth.actorOrgId || auth.orgId) as string
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = syncSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()

  type ConfigService = {
    getValue<T>(moduleId: string, name: string, options?: { defaultValue?: T | null }): Promise<T | null>
    setValue(moduleId: string, name: string, value: unknown): Promise<unknown>
  }
  const configService = container.resolve('moduleConfigService') as ConfigService

  // Preserve lastSyncAt from existing settings when saving
  const existing = await configService.getValue<SyncSettings>(CONFIG_MODULE_ID, CONFIG_NAME)
  await configService.setValue(CONFIG_MODULE_ID, CONFIG_NAME, {
    ...parsed.data,
    lastSyncAt: parsed.data.lastSyncAt ?? existing?.lastSyncAt ?? null,
  })

  // Register or update the scheduled job
  try {
    type SchedulerServiceType = {
      register(registration: Record<string, unknown>): Promise<void>
      exists(scheduleId: string): Promise<boolean>
      update(scheduleId: string, changes: Record<string, unknown>): Promise<void>
    }
    const schedulerService = container.resolve('schedulerService') as SchedulerServiceType

    const scheduleId = buildScheduleId(tenantId)

    if (parsed.data.syncEnabled) {
      await schedulerService.register({
        id: scheduleId,
        name: 'KSeF Receive Invoice Sync',
        description: `Automatically fetch received invoices from KSeF every ${parsed.data.syncIntervalMinutes} minutes`,
        scopeType: 'organization',
        organizationId,
        tenantId,
        scheduleType: 'interval',
        scheduleValue: `${parsed.data.syncIntervalMinutes}m`,
        timezone: 'UTC',
        targetType: 'queue',
        targetQueue: 'ksef-receive-sync',
        targetPayload: {},
        requireFeature: 'ksef.receive',
        sourceType: 'module',
        sourceModule: 'ksef',
        isEnabled: true,
      })
    } else {
      const exists = await schedulerService.exists(scheduleId)
      if (exists) {
        await schedulerService.update(scheduleId, { isEnabled: false })
      }
    }
  } catch (err) {
    logger.error('ksef.settings.scheduler_update_failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    // Settings are saved even if scheduler update fails
  }

  return NextResponse.json({
    ...parsed.data,
    message: parsed.data.syncEnabled
      ? `Sync scheduled every ${parsed.data.syncIntervalMinutes} minutes`
      : 'Automatic sync disabled',
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'KSeF sync settings',
  methods: {
    GET: {
      summary: 'Get KSeF sync settings',
      description: 'Returns the current automatic sync configuration for KSeF received invoices',
    },
    PUT: {
      summary: 'Update KSeF sync settings',
      description: 'Configure automatic scheduled syncing of received invoices from KSeF',
    },
  },
}
