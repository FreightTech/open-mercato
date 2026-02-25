import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcConsole, FrcConsoleCargo } from '../../../../data/entities'
import { FrcProjectAirCargo } from '../../../../../frc_projects/data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['frc_console.manage'] },
}

export const openApi = {
  post: {
    summary: 'Sync console cargo from project',
    description:
      'Synchronizes the console cargo quantities with the project cargo assignments. Creates missing cargo entries and updates existing quantities.',
    tags: ['frc_console'],
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Console ID',
      },
    ],
    responses: {
      200: {
        description: 'Cargo synced successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                created: { type: 'integer', description: 'Number of new cargo entries created' },
                updated: { type: 'integer', description: 'Number of existing cargo entries updated' },
              },
            },
          },
        },
      },
      400: { description: 'Console has no linked project' },
      404: { description: 'Console not found' },
    },
  },
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Find console
  const console_ = await em.findOne(FrcConsole, { id, deletedAt: null })
  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  if (!console_.projectId) {
    return NextResponse.json({ error: 'Console has no linked project' }, { status: 400 })
  }

  // Get project cargo assignments
  const projectCargo = await em.find(FrcProjectAirCargo, {
    projectId: console_.projectId,
    organizationId: console_.organizationId,
    tenantId: console_.tenantId,
  })

  // Get existing console cargo
  const existingConsoleCargo = await em.find(FrcConsoleCargo, {
    console: { id: console_.id },
    deletedAt: null,
  })
  const existingMap = new Map(existingConsoleCargo.map((c) => [c.airCargoId, c]))

  let created = 0
  let updated = 0

  for (const pc of projectCargo) {
    const existing = existingMap.get(pc.airCargoId)
    if (existing) {
      // Update quantity if different
      if (existing.quantity !== pc.quantity) {
        existing.quantity = pc.quantity
        updated++
      }
    } else {
      // Create new console cargo entry
      const newCargo = em.create(FrcConsoleCargo, {
        organizationId: console_.organizationId,
        tenantId: console_.tenantId,
        console: console_,
        airCargoId: pc.airCargoId,
        quantity: pc.quantity,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      em.persist(newCargo)
      created++
    }
  }

  await em.flush()

  return NextResponse.json({ success: true, created, updated })
}
