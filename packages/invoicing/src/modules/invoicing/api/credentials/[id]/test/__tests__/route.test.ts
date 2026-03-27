/** @jest-environment node */
import { POST } from '../route'

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

function makeCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cred-1',
    nip: '1234567890',
    authType: 'token',
    ksefToken: 'test-token',
    environment: 'test',
    isActive: true,
    certificatePem: null,
    privateKeyPem: null,
    ...overrides,
  }
}

describe('POST /api/invoicing/credentials/[id]/test', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getAuthFromRequestMock.mockResolvedValue({ tenantId: 't1', actorTenantId: 't1' })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function setup(credential: ReturnType<typeof makeCredential> | null = makeCredential()) {
    const em = { findOne: jest.fn(async () => credential) }
    createRequestContainerMock.mockResolvedValue({
      resolve: (name: string) => {
        if (name === 'em') return em
        return null
      },
    })
    return { em }
  }

  it('returns 404 when credential not found', async () => {
    setup(null)

    const res = await POST(new Request('http://localhost'), makeParams('cred-1'))

    expect(res.status).toBe(404)
  })

  it('returns 400 when credential is inactive', async () => {
    setup(makeCredential({ isActive: false }))

    const res = await POST(new Request('http://localhost'), makeParams('cred-1'))

    expect(res.status).toBe(400)
  })

  it('returns validation errors when token is missing', async () => {
    setup(makeCredential({ ksefToken: null }))

    const res = await POST(new Request('http://localhost'), makeParams('cred-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.errors).toContain('KSeF token is not configured')
  })

  it('returns validation errors when certificate is missing', async () => {
    setup(makeCredential({ authType: 'certificate', certificatePem: null, privateKeyPem: null }))

    const res = await POST(new Request('http://localhost'), makeParams('cred-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.errors).toContain('Certificate PEM is not configured')
    expect(body.errors).toContain('Private key PEM is not configured')
  })

  it('reports reachable when KSeF API responds', async () => {
    setup()
    global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true })

    const res = await POST(new Request('http://localhost'), makeParams('cred-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.connectivity.reachable).toBe(true)
    expect(body.connectivity.apiStatus).toBe(200)
    expect(body.nip).toBe('1234567890')
    expect(body.environment).toBe('test')

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api-test.ksef.mf.gov.pl'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('reports unreachable when KSeF API fails', async () => {
    setup()
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

    const res = await POST(new Request('http://localhost'), makeParams('cred-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.connectivity.reachable).toBe(false)
    expect(body.connectivity.apiStatus).toBeNull()
  })
})
