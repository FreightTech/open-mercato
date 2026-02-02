import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { Contractor } from '../../../../contractors/data/entities'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_quotes.quotes.view'],
  },
}

/**
 * GET: Search contractors (clients) for assignment
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    // Build query
    const where: Record<string, unknown> = {
      tenantId: auth.tenantId,
      deletedAt: null,
      isActive: true,
    }

    // Add search filter if provided
    if (search.trim()) {
      where.name = { $ilike: `%${search.trim()}%` }
    }

    const contractors = await em.find(Contractor, where, {
      limit,
      orderBy: { name: 'ASC' },
    })

    return NextResponse.json({
      items: contractors.map((c) => ({
        id: c.id,
        name: c.name,
      })),
      total: contractors.length,
    })
  } catch (error: any) {
    console.error('[entities/contractors] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contractors', message: error.message },
      { status: 500 }
    )
  }
}
