jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: jest.fn(),
}))
jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: jest.fn(),
}))
jest.mock('../../lib/pdf/invoice-pdf.service', () => ({
  generateInvoicePdf: jest.fn(),
}))

import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { generateInvoicePdf } from '../../lib/pdf/invoice-pdf.service'
import { GET } from '../invoices/[id]/pdf/route'

const INVOICE_ID = 'd0000000-0000-4000-8000-000000000010'
const TENANT_ID = 'b0000000-0000-4000-8000-000000000002'

function createMockRequest() {
  return new Request(`http://localhost/api/fms_invoicing/invoices/${INVOICE_ID}/pdf`)
}

function createMockContext() {
  return { params: Promise.resolve({ id: INVOICE_ID }) }
}

describe('GET /api/fms_invoicing/invoices/[id]/pdf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    ;(getAuthFromRequest as jest.Mock).mockResolvedValue(null)

    const res = await GET(createMockRequest() as any, createMockContext())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 404 when invoice not found', async () => {
    ;(getAuthFromRequest as jest.Mock).mockResolvedValue({
      tenantId: TENANT_ID,
      actorTenantId: TENANT_ID,
    })

    const mockEm = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    }
    ;(createRequestContainer as jest.Mock).mockResolvedValue({
      resolve: jest.fn(() => mockEm),
    })

    const res = await GET(createMockRequest() as any, createMockContext())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Invoice not found')
  })

  it('returns a PDF buffer when invoice exists', async () => {
    ;(getAuthFromRequest as jest.Mock).mockResolvedValue({
      tenantId: TENANT_ID,
      actorTenantId: TENANT_ID,
    })

    const mockInvoice = {
      id: INVOICE_ID,
      invoiceNumber: 'FV/001',
      tenantId: TENANT_ID,
      deletedAt: null,
    }
    const mockLineItems = [
      {
        id: 'li-1',
        lineNumber: 1,
        description: 'Service',
        quantity: '1',
        unitPriceNet: '100.00',
        vatRate: '23',
        vatRateCode: '23',
        netAmount: '100.00',
        vatAmount: '23.00',
        grossAmount: '123.00',
      },
    ]

    const mockEm = {
      findOne: jest.fn().mockResolvedValue(mockInvoice),
      find: jest.fn().mockResolvedValue(mockLineItems),
    }
    ;(createRequestContainer as jest.Mock).mockResolvedValue({
      resolve: jest.fn(() => mockEm),
    })

    const pdfBuffer = Buffer.from('fake-pdf-content')
    ;(generateInvoicePdf as jest.Mock).mockResolvedValue(pdfBuffer)

    const res = await GET(createMockRequest() as any, createMockContext())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('FV/001.pdf')
    expect(res.headers.get('Content-Length')).toBe(String(pdfBuffer.length))

    // Verify generateInvoicePdf was called with the invoice and line items
    expect(generateInvoicePdf).toHaveBeenCalledWith(mockInvoice, mockLineItems)
  })

  it('returns 500 on generation error', async () => {
    ;(getAuthFromRequest as jest.Mock).mockResolvedValue({
      tenantId: TENANT_ID,
      actorTenantId: TENANT_ID,
    })

    const mockInvoice = {
      id: INVOICE_ID,
      invoiceNumber: 'FV/001',
      tenantId: TENANT_ID,
      deletedAt: null,
    }

    const mockEm = {
      findOne: jest.fn().mockResolvedValue(mockInvoice),
      find: jest.fn().mockResolvedValue([]),
    }
    ;(createRequestContainer as jest.Mock).mockResolvedValue({
      resolve: jest.fn(() => mockEm),
    })

    ;(generateInvoicePdf as jest.Mock).mockRejectedValue(new Error('PDF generation failed'))

    const res = await GET(createMockRequest() as any, createMockContext())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to generate PDF')
    expect(body.message).toBe('PDF generation failed')
  })
})
