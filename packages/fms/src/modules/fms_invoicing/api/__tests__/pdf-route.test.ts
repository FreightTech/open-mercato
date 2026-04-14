import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: vi.fn(),
}))
vi.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: vi.fn(),
}))
vi.mock('../../lib/pdf/invoice-pdf.service', () => ({
  generateInvoicePdf: vi.fn(),
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
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null as any)

    const res = await GET(createMockRequest() as any, createMockContext())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 404 when invoice not found', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue({
      tenantId: TENANT_ID,
      actorTenantId: TENANT_ID,
    } as any)

    const mockEm = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    }
    vi.mocked(createRequestContainer).mockResolvedValue({
      resolve: vi.fn(() => mockEm),
    } as any)

    const res = await GET(createMockRequest() as any, createMockContext())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Invoice not found')
  })

  it('returns a PDF buffer when invoice exists', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue({
      tenantId: TENANT_ID,
      actorTenantId: TENANT_ID,
    } as any)

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
      findOne: vi.fn().mockResolvedValue(mockInvoice),
      find: vi.fn().mockResolvedValue(mockLineItems),
    }
    vi.mocked(createRequestContainer).mockResolvedValue({
      resolve: vi.fn(() => mockEm),
    } as any)

    const pdfBuffer = Buffer.from('fake-pdf-content')
    vi.mocked(generateInvoicePdf).mockResolvedValue(pdfBuffer)

    const res = await GET(createMockRequest() as any, createMockContext())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('FV/001.pdf')
    expect(res.headers.get('Content-Length')).toBe(String(pdfBuffer.length))

    expect(generateInvoicePdf).toHaveBeenCalledWith(mockInvoice, mockLineItems)
  })

  it('returns 500 on generation error', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue({
      tenantId: TENANT_ID,
      actorTenantId: TENANT_ID,
    } as any)

    const mockInvoice = {
      id: INVOICE_ID,
      invoiceNumber: 'FV/001',
      tenantId: TENANT_ID,
      deletedAt: null,
    }

    const mockEm = {
      findOne: vi.fn().mockResolvedValue(mockInvoice),
      find: vi.fn().mockResolvedValue([]),
    }
    vi.mocked(createRequestContainer).mockResolvedValue({
      resolve: vi.fn(() => mockEm),
    } as any)

    vi.mocked(generateInvoicePdf).mockRejectedValue(new Error('PDF generation failed'))

    const res = await GET(createMockRequest() as any, createMockContext())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to generate PDF')
    expect(body.message).toBe('PDF generation failed')
  })
})
