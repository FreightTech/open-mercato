/** @jest-environment node */
import { POST } from '../route'

const createRequestContainerMock = jest.fn()
const getAuthFromRequestMock = jest.fn()
const emitInvoicingEventMock = jest.fn()
const createQueueMock = jest.fn()
const enqueueMock = jest.fn()

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: (...args: unknown[]) => createRequestContainerMock(...args),
}))

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequestMock(...args),
}))

jest.mock('../../../../../events', () => ({
  emitInvoicingEvent: (...args: unknown[]) => emitInvoicingEventMock(...args),
}))

jest.mock('@open-mercato/queue', () => ({
  createQueue: (...args: unknown[]) => createQueueMock(...args),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'FV/1',
    status: 'approved',
    ksefStatus: 'none',
    direction: 'outgoing',
    sourceType: 'manual',
    organizationId: 'org-1',
    updatedAt: null,
    ...overrides,
  }
}

describe('POST /api/invoicing/ksef/submit/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createQueueMock.mockReturnValue({ enqueue: enqueueMock })
    enqueueMock.mockResolvedValue(undefined)
    emitInvoicingEventMock.mockResolvedValue(undefined)
  })

  function setup(invoice: ReturnType<typeof makeInvoice> | null = makeInvoice()) {
    getAuthFromRequestMock.mockResolvedValue({ tenantId: 't1', actorTenantId: 't1' })
    const em = {
      findOne: jest.fn(async () => invoice),
      flush: jest.fn(async () => undefined),
    }
    createRequestContainerMock.mockResolvedValue({
      resolve: (name: string) => {
        if (name === 'em') return em
        return null
      },
    })
    return { em }
  }

  it('returns 401 when not authenticated', async () => {
    getAuthFromRequestMock.mockResolvedValue(null)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    setup(null)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(404)
  })

  it('returns 400 when invoice is not approved', async () => {
    setup(makeInvoice({ status: 'draft' }))

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/approved/)
  })

  it('returns 400 when invoice already has KSeF status', async () => {
    setup(makeInvoice({ ksefStatus: 'submitted' }))

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/already has KSeF status/)
  })

  it('queues invoice, enqueues worker, and emits event', async () => {
    const invoice = makeInvoice()
    const { em } = setup(invoice)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ksefStatus).toBe('queued')

    expect(invoice.ksefStatus).toBe('queued')
    expect(em.flush).toHaveBeenCalled()

    expect(createQueueMock).toHaveBeenCalledWith('invoicing-ksef-submit', 'local')
    expect(enqueueMock).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      tenantId: 't1',
      organizationId: 'org-1',
    })

    expect(emitInvoicingEventMock).toHaveBeenCalledWith('invoicing.ksef.queued', expect.objectContaining({
      id: 'inv-1',
      tenantId: 't1',
      organizationId: 'org-1',
      invoiceNumber: 'FV/1',
    }))
  })

  it('allows resubmission when ksefStatus is error', async () => {
    const invoice = makeInvoice({ ksefStatus: 'error' })
    setup(invoice)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(200)
    expect(enqueueMock).toHaveBeenCalled()
  })
})
