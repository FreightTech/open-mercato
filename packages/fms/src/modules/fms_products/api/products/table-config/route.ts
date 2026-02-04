import { NextRequest } from 'next/server'
import { EntityManager } from '@mikro-orm/core'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FmsProduct } from '../../../data/entities'
import { generateTableConfig, type DisplayHints } from './table-config-generator'

const PRODUCTS_DISPLAY_HINTS: DisplayHints = {
  hiddenFields: [
    'variants',
    'source',
    'destination',
    'location',
    'loop',
    'transitTime',
    'description',
    'createdBy',
    'updatedBy',
  ],

  readOnlyFields: ['createdAt', 'updatedAt'],

  customRenderers: {
    name: 'ProductNameRenderer',
  },

  dropdownSources: {},

  columnWidths: {
    name: 280, // Wider name column
  },

  additionalColumns: [
    {
      data: 'chargeCodeCode',
      title: 'Charge Code',
      width: 120,
      type: 'text',
      readOnly: true,
      renderer: 'ChargeCodeRenderer',
      insertAfter: 'name', // Insert after Name
    },
    {
      data: 'carrierName',
      title: 'Carrier',
      width: 180,
      type: 'text',
      readOnly: true,
      insertAfter: 'chargeCodeCode', // Insert after Charge Code
    },
    {
      data: 'variantCount',
      title: 'Variants',
      width: 80,
      type: 'numeric',
      readOnly: true,
      insertAfter: 'carrierName', // Insert after Carrier
    },
  ],
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const metadata = em.getMetadata().get(FmsProduct.name)

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
