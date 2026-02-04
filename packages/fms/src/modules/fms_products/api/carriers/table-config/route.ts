import { NextRequest } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

export interface TableColumnConfig {
  data: string
  title: string
  width: number
  type?: 'text' | 'numeric' | 'date' | 'dropdown' | 'checkbox'
  dateFormat?: string
  readOnly?: boolean
  source?: string[]
  renderer?: string
}

const CARRIER_TYPE_VALUES = ['sea', 'air', 'rail', 'road']

const CARRIER_COLUMNS: TableColumnConfig[] = [
  {
    data: 'name',
    title: 'Name',
    width: 400,
  },
  {
    data: 'carrierType',
    title: 'Type',
    width: 150,
    type: 'dropdown',
    source: CARRIER_TYPE_VALUES,
    renderer: 'CarrierTypeRenderer',
  },
  {
    data: 'isActive',
    title: 'Active',
    width: 100,
    type: 'checkbox',
  },
]

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return Response.json({
      columns: CARRIER_COLUMNS,
      meta: {
        entity: 'fms_carrier',
        totalColumns: CARRIER_COLUMNS.length,
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
  GET: { requireAuth: true, requireFeatures: ['fms_products.carriers.view'] },
}
