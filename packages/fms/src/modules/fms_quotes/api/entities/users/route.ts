import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { User } from '@open-mercato/core/modules/auth/data/entities'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_quotes.quotes.view'],
  },
}

/**
 * GET: Search users for assignment
 */
export async function GET(request: NextRequest) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || searchParams.get('q') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // Build query
    const where: Record<string, unknown> = {
      tenantId: auth.tenantId,
      deletedAt: null,
    }

    // Add search filter if provided
    if (search.trim()) {
      where.$or = [
        { name: { $ilike: `%${search.trim()}%` } },
        { email: { $ilike: `%${search.trim()}%` } },
      ]
    }

    const users = await em.find(User, where, {
      limit,
      orderBy: { name: 'ASC', email: 'ASC' },
    })

    return NextResponse.json({
      items: users.map((u) => ({
        id: u.id,
        name: u.name || u.email,
        email: u.email,
      })),
      total: users.length,
    })
  } catch (error: any) {
    console.error('[entities/users] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users', message: error.message },
      { status: 500 }
    )
  }
}
