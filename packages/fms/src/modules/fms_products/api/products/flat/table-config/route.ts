import { NextRequest } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

export interface FlatTableColumnConfig {
  data: string
  title: string
  width: number
  type?: 'text' | 'numeric' | 'date' | 'dropdown' | 'checkbox' | 'entity-search'
  dateFormat?: string
  readOnly?: boolean
  source?: string[]
  renderer?: string
  meta?: {
    entityType: 'product' | 'variant'
    editable?: boolean
    searchConfig?: {
      entityType: string
      displayField: string
      valueField: string
      searchEndpoint?: string
    }
  }
}

// Product columns - edits go to /api/fms_products/products/{productId}
const PRODUCT_COLUMNS: FlatTableColumnConfig[] = [
  {
    data: 'name',
    title: 'Product Name',
    width: 220,
    type: 'text',
    renderer: 'ProductNameRenderer',
    meta: { entityType: 'product', editable: true },
  },
  {
    data: 'chargeCodeId',
    title: 'Charge Code',
    width: 130,
    type: 'entity-search',
    renderer: 'ChargeCodeCellRenderer',
    meta: {
      entityType: 'product',
      editable: true,
      searchConfig: {
        entityType: 'fms_products:fms_charge_code',
        displayField: 'code',
        valueField: 'id',
      },
    },
  },
  {
    data: 'carrierId',
    title: 'Carrier',
    width: 140,
    type: 'entity-search',
    renderer: 'CarrierCellRenderer',
    meta: {
      entityType: 'product',
      editable: true,
      searchConfig: {
        entityType: 'fms_products:fms_carrier',
        displayField: 'name',
        valueField: 'id',
      },
    },
  },
  {
    data: 'loop',
    title: 'Loop',
    width: 100,
    type: 'text',
    meta: { entityType: 'product', editable: true },
  },
  {
    data: 'sourceId',
    title: 'Origin',
    width: 150,
    type: 'entity-search',
    renderer: 'OriginCellRenderer',
    meta: {
      entityType: 'product',
      editable: true,
      searchConfig: {
        entityType: 'fms_locations:fms_location',
        displayField: 'name',
        valueField: 'id',
      },
    },
  },
  {
    data: 'destinationId',
    title: 'Destination',
    width: 150,
    type: 'entity-search',
    renderer: 'DestinationCellRenderer',
    meta: {
      entityType: 'product',
      editable: true,
      searchConfig: {
        entityType: 'fms_locations:fms_location',
        displayField: 'name',
        valueField: 'id',
      },
    },
  },
  {
    data: 'transitTime',
    title: 'Transit (days)',
    width: 100,
    type: 'numeric',
    meta: { entityType: 'product', editable: true },
  },
  {
    data: 'isActive',
    title: 'Active',
    width: 70,
    type: 'checkbox',
    meta: { entityType: 'product', editable: true },
  },
]

// Variant columns - edits go to /api/fms_products/products/{productId}/variants/{variantId}
const VARIANT_COLUMNS: FlatTableColumnConfig[] = [
  {
    data: 'validityStart',
    title: 'Valid From',
    width: 110,
    type: 'date',
    dateFormat: 'yyyy-MM-dd',
    meta: { entityType: 'variant', editable: true },
  },
  {
    data: 'validityEnd',
    title: 'Valid To',
    width: 110,
    type: 'date',
    dateFormat: 'yyyy-MM-dd',
    meta: { entityType: 'variant', editable: true },
  },
  {
    data: 'price',
    title: 'Price',
    width: 100,
    type: 'numeric',
    meta: { entityType: 'variant', editable: true },
  },
  {
    data: 'currencyCode',
    title: 'Currency',
    width: 80,
    type: 'dropdown',
    source: ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'PLN', 'CHF'],
    meta: { entityType: 'variant', editable: true },
  },
  {
    data: 'providerId',
    title: 'Provider',
    width: 150,
    type: 'entity-search',
    renderer: 'ProviderCellRenderer',
    meta: {
      entityType: 'variant',
      editable: true,
      searchConfig: {
        entityType: 'contractors:contractor',
        displayField: 'name',
        valueField: 'id',
      },
    },
  },
  {
    data: 'reference',
    title: 'Reference',
    width: 120,
    type: 'text',
    meta: { entityType: 'variant', editable: true },
  },
  {
    data: 'containerSize',
    title: 'Container',
    width: 100,
    type: 'dropdown',
    source: ['20DV', '40DV', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR'],
    meta: { entityType: 'variant', editable: true },
  },
  {
    data: 'variantIsActive',
    title: 'Var. Active',
    width: 80,
    type: 'checkbox',
    meta: { entityType: 'variant', editable: true },
  },
]

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Combine product and variant columns
    const columns: FlatTableColumnConfig[] = [...PRODUCT_COLUMNS, ...VARIANT_COLUMNS]

    return Response.json({
      columns,
      meta: {
        entity: 'fms_product_flat',
        totalColumns: columns.length,
        productColumnCount: PRODUCT_COLUMNS.length,
        variantColumnCount: VARIANT_COLUMNS.length,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to generate flat table config:', error)
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
