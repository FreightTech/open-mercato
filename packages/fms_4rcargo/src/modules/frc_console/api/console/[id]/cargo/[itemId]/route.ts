import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcConsole, FrcConsoleCargo } from '../../../../../data/entities'

export const metadata = {
  DELETE: { requireAuth: true, requireFeatures: ['frc_console.manage'] },
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, itemId } = await params
  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Verify console exists
  const console_ = await em.findOne(FrcConsole, { id, deletedAt: null })
  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  // Find the console cargo entry
  const consoleItem = await em.findOne(FrcConsoleCargo, {
    id: itemId,
    console: console_,
    deletedAt: null,
  })

  if (!consoleItem) {
    return NextResponse.json({ error: 'Cargo item not found' }, { status: 404 })
  }

  // Soft delete the item
  consoleItem.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
