/** @jest-environment node */
import { POST } from '../route'

const createRequestContainerMock = jest.fn()

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: (...args: unknown[]) => createRequestContainerMock(...args),
}))

const getAuthFromRequestMock = jest.fn()

jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequestMock(...args),
}))

const buildFa3XmlMock = jest.fn()

jest.mock('../../../../../lib/ksef/xml-builder', () => ({
  buildFa3Xml: (...args: unknown[]) => buildFa3XmlMock(...args),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeEm(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    ...overrides,
  }
}

function setupAuth(auth: Record<string, unknown> | null = { tenantId: 't1', actorTenantId: 't1' }) {
  getAuthFromRequestMock.mockResolvedValue(auth)
}

function setupContainer(em: ReturnType<typeof makeEm>) {
  createRequestContainerMock.mockResolvedValue({
    resolve: (name: string) => {
      if (name === 'em') return em
      return null
    },
  })
}

describe('POST /api/invoicing/ksef/generate-xml/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    setupAuth(null)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    setupAuth()
    const em = makeEm()
    setupContainer(em)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(404)
  })

  it('returns 400 when sellerTaxId is missing', async () => {
    setupAuth()
    const invoice = { id: 'inv-1', invoiceNumber: 'FV/1', sellerTaxId: null, invoiceDate: new Date() }
    const em = makeEm({ findOne: jest.fn(async () => invoice) })
    setupContainer(em)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Seller tax ID/)
  })

  it('returns 400 when invoiceDate is missing', async () => {
    setupAuth()
    const invoice = { id: 'inv-1', invoiceNumber: 'FV/1', sellerTaxId: '1234567890', invoiceDate: null }
    const em = makeEm({ findOne: jest.fn(async () => invoice) })
    setupContainer(em)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Invoice date/)
  })

  it('returns 400 when no line items', async () => {
    setupAuth()
    const invoice = { id: 'inv-1', invoiceNumber: 'FV/1', sellerTaxId: '1234567890', invoiceDate: new Date() }
    const em = makeEm({
      findOne: jest.fn(async () => invoice),
      find: jest.fn(async () => []),
    })
    setupContainer(em)

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/line item/)
  })

  it('returns XML when invoice is valid', async () => {
    setupAuth()
    const invoice = { id: 'inv-1', invoiceNumber: 'FV/1', sellerTaxId: '1234567890', invoiceDate: new Date() }
    const lineItems = [{ id: 'li-1', lineNumber: 1, description: 'Service', quantity: 1 }]
    const em = makeEm({
      findOne: jest.fn(async () => invoice),
      find: jest.fn(async () => lineItems),
    })
    setupContainer(em)
    buildFa3XmlMock.mockReturnValue('<Faktura>test</Faktura>')

    const res = await POST(new Request('http://localhost'), makeParams('inv-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.xml).toBe('<Faktura>test</Faktura>')
    expect(body.invoiceNumber).toBe('FV/1')
    expect(body.lineItemCount).toBe(1)
    expect(buildFa3XmlMock).toHaveBeenCalledWith(invoice, lineItems, { correctedKsefNumber: null })
  })
})
