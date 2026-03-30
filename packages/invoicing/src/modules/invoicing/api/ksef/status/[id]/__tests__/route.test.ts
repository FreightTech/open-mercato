/** @jest-environment node */
import { GET } from '../route'

const createRequestContainerMock = jest.fn()
const getAuthFromRequestMock = jest.fn()

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: (...args: unknown[]) => createRequestContainerMock(...args),
}))

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequestMock(...args),
}))

const originalFetch = global.fetch

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'FV/1',
    organizationId: 'org-1',
    ksefStatus: 'none',
    ksefNumber: null,
    ksefSessionId: null,
    ksefSubmittedAt: null,
    ksefAcceptedAt: null,
    ksefReferenceNumber: null,
    ksefErrorMessage: null,
    ksefErrorCode: null,
    ...overrides,
  }
}

describe('GET /api/invoicing/ksef/status/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getAuthFromRequestMock.mockResolvedValue({ tenantId: 't1', actorTenantId: 't1' })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function setup(invoice: ReturnType<typeof makeInvoice> | null = makeInvoice(), settings: Record<string, unknown> | null = null) {
    const persistMock = jest.fn().mockReturnValue({ flush: jest.fn() })
    const em = {
      findOne: jest.fn(async (_entity: unknown, where: Record<string, unknown>) => {
        if (where.id) return invoice
        return settings
      }),
      persist: persistMock,
    }
    createRequestContainerMock.mockResolvedValue({
      resolve: (name: string) => {
        if (name === 'em') return em
        return null
      },
    })
    return { em, persistMock }
  }

  it('returns cached status for invoices not in submitted/processing state', async () => {
    setup(makeInvoice({ ksefStatus: 'accepted', ksefNumber: 'KSeF-123' }))

    const res = await GET(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ksefStatus).toBe('accepted')
    expect(body.ksefNumber).toBe('KSeF-123')
  })

  it('polls KSeF API when invoice is submitted with reference number', async () => {
    const invoice = makeInvoice({
      ksefStatus: 'submitted',
      ksefReferenceNumber: 'ref-123',
    })
    const settings = { ksefEnvironment: 'test' }
    const { persistMock } = setup(invoice, settings)

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        processingCode: 200,
        processingDescription: 'Invoice accepted',
        elementReferenceNumber: 'ref-123',
        ksefReferenceNumber: 'KSeF-456',
      }),
    })

    const res = await GET(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ksefStatus).toBe('accepted')
    expect(body.ksefNumber).toBe('KSeF-456')
    expect(invoice.ksefAcceptedAt).toBeInstanceOf(Date)

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ref-123/status'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(persistMock).toHaveBeenCalled()
  })

  it('updates status to rejected when KSeF returns rejection code', async () => {
    const invoice = makeInvoice({
      ksefStatus: 'submitted',
      ksefReferenceNumber: 'ref-123',
    })
    setup(invoice, { ksefEnvironment: 'test' })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        processingCode: 300,
        processingDescription: 'Invoice rejected',
        elementReferenceNumber: 'ref-123',
      }),
    })

    const res = await GET(new Request('http://localhost'), makeParams('inv-1'))

    const body = await res.json()
    expect(body.ksefStatus).toBe('rejected')
    expect(body.ksefErrorMessage).toBe('Invoice rejected')
    expect(body.ksefErrorCode).toBe('300')
  })

  it('returns cached status when KSeF API is unreachable', async () => {
    const invoice = makeInvoice({
      ksefStatus: 'submitted',
      ksefReferenceNumber: 'ref-123',
    })
    setup(invoice, { ksefEnvironment: 'test' })

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

    const res = await GET(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ksefStatus).toBe('submitted')
  })

  it('does not poll when invoice has no reference number', async () => {
    setup(makeInvoice({ ksefStatus: 'submitted', ksefReferenceNumber: null }))
    global.fetch = jest.fn()

    const res = await GET(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(200)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
