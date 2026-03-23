import { NextRequest } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { TableColumnConfig } from './table-config-generator'

const TYPE_VALUES = [
  'port',
  'terminal',
  'airport',
  'port_terminal',
  'depot',
  'rail_terminal',
  'intermodal',
  'container_yard',
  'cfs',
  'border_crossing',
  'contractor_office',
  'contractor_warehouse',
  'contractor_billing',
  'contractor_shipping',
  'contractor_other',
]

const LOCATION_COLUMNS: TableColumnConfig[] = [
  {
    data: 'name',
    title: 'Name',
    width: 200,
    renderer: 'NameRenderer',
  },
  {
    data: 'type',
    title: 'Type',
    width: 100,
    type: 'dropdown',
    source: TYPE_VALUES,
    renderer: 'TypeRenderer',
  },
  {
    data: 'code',
    title: 'Code',
    width: 120,
    renderer: 'CodeRenderer',
  },
  {
    data: 'locode',
    title: 'UN/LOCODE',
    width: 120,
  },
  {
    data: 'addressLine1',
    title: 'Address',
    width: 200,
  },
  {
    data: 'city',
    title: 'City',
    width: 150,
  },
  {
    data: 'country',
    title: 'Country',
    width: 120,
  },
]

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return Response.json({
      columns: LOCATION_COLUMNS,
      meta: {
        entity: 'fms_location',
        totalColumns: LOCATION_COLUMNS.length,
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
  GET: { requireAuth: true, requireFeatures: ['fms_locations.ports.view'] },
}
