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

const DOCUMENT_CATEGORIES = ['offer', 'invoice', 'customs_declaration', 'bill_of_lading', 'booking_confirmation', 'delivery_note', 'packing_list', 'vgm_certificate', 'other']

const DOCUMENT_COLUMNS: TableColumnConfig[] = [
  {
    data: 'name',
    title: 'Name',
    width: 250,
  },
  {
    data: 'category',
    title: 'Category',
    width: 130,
    type: 'dropdown',
    source: DOCUMENT_CATEGORIES,
    renderer: 'CategoryBadgeRenderer',
  },
  {
    data: 'documentType',
    title: 'Detected Type',
    width: 120,
    readOnly: true,
    renderer: 'DocumentTypeBadgeRenderer',
  },
  {
    data: 'documentNumber',
    title: 'Doc Number',
    width: 160,
    readOnly: true,
  },
  {
    data: 'blNumber',
    title: 'B/L Number',
    width: 160,
    readOnly: true,
  },
  {
    data: 'bookingNumber',
    title: 'Booking No.',
    width: 140,
    readOnly: true,
  },
  {
    data: 'vesselName',
    title: 'Vessel',
    width: 150,
    readOnly: true,
  },
  {
    data: 'portOfLoading',
    title: 'POL',
    width: 140,
    readOnly: true,
  },
  {
    data: 'portOfDischarge',
    title: 'POD',
    width: 140,
    readOnly: true,
  },
  {
    data: 'sellerName',
    title: 'Seller',
    width: 180,
    readOnly: true,
  },
  {
    data: 'totalGrossAmount',
    title: 'Amount',
    width: 100,
    readOnly: true,
  },
  {
    data: 'currency',
    title: 'Currency',
    width: 80,
    readOnly: true,
  },
]

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return Response.json({
      columns: DOCUMENT_COLUMNS,
      meta: {
        entity: 'fms_document',
        totalColumns: DOCUMENT_COLUMNS.length,
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
  GET: { requireAuth: true, requireFeatures: ['fms_documents.view'] },
}
