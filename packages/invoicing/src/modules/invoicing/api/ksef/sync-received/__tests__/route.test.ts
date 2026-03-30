/** @jest-environment node */
import { POST } from '../route'

const createRequestContainerMock = jest.fn()
const getAuthFromRequestMock = jest.fn()
const createQueueMock = jest.fn()
const enqueueMock = jest.fn()

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: (...args: unknown[]) => createRequestContainerMock(...args),
}))

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequestMock(...args),
}))

jest.mock('@open-mercato/queue', () => ({
  createQueue: (...args: unknown[]) => createQueueMock(...args),
}))

describe('POST /api/invoicing/ksef/sync-received', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createQueueMock.mockReturnValue({ enqueue: enqueueMock })
    enqueueMock.mockResolvedValue(undefined)
    getAuthFromRequestMock.mockResolvedValue({
      tenantId: 't1',
      actorTenantId: 't1',
      orgId: 'org-1',
      actorOrgId: 'org-1',
    })
  })

  function setup(settings: Record<string, unknown> | null = { defaultSellerNip: '1234567890' }) {
    const em = { findOne: jest.fn(async () => settings) }
    createRequestContainerMock.mockResolvedValue({
      resolve: (name: string) => {
        if (name === 'em') return em
        return null
      },
    })
    return { em }
  }

  function makeRequest(body: Record<string, unknown> = {}) {
    return new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 400 when NIP is not configured', async () => {
    setup({ defaultSellerNip: null })

    const res = await POST(makeRequest())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/NIP/)
  })

  it('enqueues receive-sync worker with NIP from settings', async () => {
    setup()

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe('Receive sync job enqueued')
    expect(body.nip).toBe('1234567890')

    expect(createQueueMock).toHaveBeenCalledWith('invoicing-ksef-receive-sync', 'local')
    expect(enqueueMock).toHaveBeenCalledWith({
      tenantId: 't1',
      organizationId: 'org-1',
      nip: '1234567890',
      dateFrom: undefined,
      dateTo: undefined,
    })
  })

  it('passes date range to worker when provided', async () => {
    setup()

    const res = await POST(makeRequest({ dateFrom: '2026-01-01', dateTo: '2026-03-22' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dateFrom).toBe('2026-01-01')
    expect(body.dateTo).toBe('2026-03-22')

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nip: '1234567890',
        tenantId: 't1',
        organizationId: 'org-1',
      })
    )
  })
})
