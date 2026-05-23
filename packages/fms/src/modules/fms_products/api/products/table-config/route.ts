import { NextRequest } from 'next/server'
import { EntityManager } from '@mikro-orm/core'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FmsProduct } from '../../../data/entities'
import { generateTableConfig, type DisplayHints } from './table-config-generator'

const PRODUCTS_DISPLAY_HINTS: DisplayHints = {
  hiddenFields: [
    'createdBy',
    'updatedBy',
  ],

  readOnlyFields: ['createdAt', 'updatedAt'],

  customRenderers: {
    name: 'ProductNameRenderer',
  },

  dropdownSources: {
    chargeUnit: ['container', 'file', 'weight_measure', 'cargo_value_percent'],
    transportMode: ['sea', 'air', 'rail'],
  },

  columnWidths: {
    name: 280,
    chargeCode: 130,
    chargeUnit: 140,
    transportMode: 120,
  },
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const metadata = em.getMetadata().get(FmsProduct.name as any)

    const columns = generateTableConfig(metadata, PRODUCTS_DISPLAY_HINTS)

    return Response.json({
      columns,
      meta: {
        entity: 'fms_product',
        totalColumns: columns.length,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to generate table config:', error)
    return Response.json(
      {
        error: 'Failed to generate table configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
}
