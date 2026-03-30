/** @jest-environment node */
import { POST } from '../route'

const createRequestContainerMock = jest.fn()
const getAuthFromRequestMock = jest.fn()
const resolveOrganizationScopeMock = jest.fn()
const createQueueMock = jest.fn()
const enqueueMock = jest.fn()

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: (...args: unknown[]) => createRequestContainerMock(...args),
}))

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequestMock(...args),
}))

jest.mock('@open-mercato/core/modules/directory/utils/organizationScope', () => ({
  resolveOrganizationScopeForRequest: (...args: unknown[]) => resolveOrganizationScopeMock(...args),
}))

jest.mock('@open-mercato/queue', () => ({
  createQueue: (...args: unknown[]) => createQueueMock(...args),
}))

import { randomUUID } from 'crypto'

const UUID1 = randomUUID()
const UUID2 = randomUUID()
const UUID3 = randomUUID()

describe('POST /api/invoicing/ksef/submit-batch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createQueueMock.mockReturnValue({ enqueue: enqueueMock })
    enqueueMock.mockResolvedValue(undefined)
    getAuthFromRequestMock.mockResolvedValue({ tenantId: 't1', actorTenantId: 't1' })
    resolveOrganizationScopeMock.mockResolvedValue({ filterIds: ['org-1'] })
  })

  function setup(invoices: Array<Record<string, unknown>> = []) {
    const em = {
      find: jest.fn(async () => invoices),
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

  function makeRequest(invoiceIds: string[]) {
    return new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceIds }),
    })
  }

  it('enqueues a submit job per eligible invoice', async () => {
    const invoices = [
      { id: UUID1, status: 'approved', ksefStatus: 'none', organizationId: 'org-1', updatedAt: null },
      { id: UUID2, status: 'approved', ksefStatus: 'error', organizationId: 'org-1', updatedAt: null },
    ]
    const { em } = setup(invoices)

    const res = await POST(makeRequest([UUID1, UUID2]))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.queuedCount).toBe(2)

    expect(invoices[0].ksefStatus).toBe('queued')
    expect(invoices[1].ksefStatus).toBe('queued')
    expect(em.flush).toHaveBeenCalled()

    expect(createQueueMock).toHaveBeenCalledWith('invoicing-ksef-submit', 'local')
    expect(enqueueMock).toHaveBeenCalledTimes(2)
    expect(enqueueMock).toHaveBeenCalledWith({ invoiceId: UUID1, tenantId: 't1', organizationId: 'org-1' })
    expect(enqueueMock).toHaveBeenCalledWith({ invoiceId: UUID2, tenantId: 't1', organizationId: 'org-1' })
  })

  it('skips non-approved and already-submitted invoices', async () => {
    const invoices = [
      { id: UUID1, status: 'draft', ksefStatus: 'none', organizationId: 'org-1', updatedAt: null },
      { id: UUID2, status: 'approved', ksefStatus: 'submitted', organizationId: 'org-1', updatedAt: null },
      { id: UUID3, status: 'approved', ksefStatus: 'none', organizationId: 'org-1', updatedAt: null },
    ]
    setup(invoices)

    const res = await POST(makeRequest([UUID1, UUID2, UUID3]))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.queuedCount).toBe(1)
    expect(body.queued).toEqual([UUID3])
    expect(body.skipped.notApproved).toEqual([UUID1])
    expect(body.skipped.alreadySubmitted).toEqual([UUID2])
    expect(enqueueMock).toHaveBeenCalledTimes(1)
  })
})
