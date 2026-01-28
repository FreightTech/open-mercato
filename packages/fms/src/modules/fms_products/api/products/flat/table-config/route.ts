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
    data: 'chargeCodeCode',
    title: 'Charge Code',
    width: 110,
    type: 'text',
    readOnly: true,
    renderer: 'ChargeCodeRenderer',
    meta: { entityType: 'product', editable: false },
  },
  {
    data: 'carrierName',
    title: 'Carrier',
    width: 140,
    type: 'text',
    readOnly: true,
    meta: { entityType: 'product', editable: false },
  },
  {
    data: 'loop',
    title: 'Loop',
    width: 100,
    type: 'text',
    meta: { entityType: 'product', editable: true },
  },
  {
    data: 'sourceName',
    title: 'Origin',
    width: 140,
    type: 'text',
    readOnly: true,
    meta: { entityType: 'product', editable: false },
  },
  {
    data: 'destinationName',
    title: 'Destination',
    width: 140,
    type: 'text',
    readOnly: true,
    meta: { entityType: 'product', editable: false },
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
    source: ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'PLN'],
    meta: { entityType: 'variant', editable: true },
  },
  {
    data: 'priceTypeName',
    title: 'Price Type',
    width: 120,
    type: 'text',
    readOnly: true,
    meta: { entityType: 'variant', editable: false },
  },
  {
    data: 'providerName',
    title: 'Provider',
    width: 150,
    type: 'text',
    readOnly: true,
    meta: { entityType: 'variant', editable: false },
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
