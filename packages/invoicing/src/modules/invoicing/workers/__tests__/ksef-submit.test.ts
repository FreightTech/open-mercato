/** @jest-environment node */
import handle from '../ksef-submit'
import type { SubmitPayload } from '../ksef-submit'

const buildFa3XmlMock = jest.fn()

jest.mock('../../lib/ksef/xml-builder', () => ({
  buildFa3Xml: (...args: unknown[]) => buildFa3XmlMock(...args),
}))

jest.mock('../../lib/ksef/crypto', () => ({
  prepareInvoiceForSubmission: jest.fn(() => ({
    hashValue: 'hash-abc',
    fileSize: 1024,
    encrypted: false,
    invoiceBody: 'base64body',
  })),
}))

jest.mock('../../lib/ksef/endpoints', () => ({
  getSendInvoiceUrl: jest.fn(() => 'https://api-test.ksef.mf.gov.pl/v2/invoices/send'),
}))

jest.mock('@open-mercato/queue', () => ({
  createQueue: jest.fn(() => ({ enqueue: jest.fn() })),
}))

const originalFetch = global.fetch

function makeJob(payload: Partial<SubmitPayload> = {}): { payload: SubmitPayload } {
  return {
    payload: {
      invoiceId: 'inv-1',
      tenantId: 't1',
      organizationId: 'org-1',
      ...payload,
    },
  }
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'FV/1',
    ksefStatus: 'queued',
    ksefFaXml: null,
    ksefSessionId: null,
    ksefReferenceNumber: null,
    ksefSubmittedAt: null,
    ksefErrorMessage: null,
    ksefErrorCode: null,
    sellerTaxId: '1234567890',
    organizationId: 'org-1',
    ...overrides,
  }
}

describe('ksef-submit worker', () => {
  let em: Record<string, jest.Mock>
  let ctx: { resolve: <T = unknown>(name: string) => T }

  beforeEach(() => {
    jest.clearAllMocks()
    buildFa3XmlMock.mockReturnValue('<Faktura>test</Faktura>')

    const flushMock = jest.fn()
    em = {
      findOne: jest.fn(),
      find: jest.fn(async () => []),
      persist: jest.fn().mockReturnValue({ flush: flushMock }),
    }

    ctx = {
      resolve: ((name: string) => {
        if (name === 'em') return em
        if (name === 'invoicingKsefAuthService') {
          return {
            authenticate: jest.fn(async () => ({
              session: {
                id: 'session-1',
                sessionToken: 'access-token',
                encryptionKey: null,
                encryptionIv: null,
                invoiceCount: 0,
              },
              accessToken: 'access-token',
            })),
          }
        }
        return null
      }) as <T = unknown>(name: string) => T,
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('sets error status when invoice has no line items', async () => {
    const invoice = makeInvoice()
    const settings = { tenantId: 't1', organizationId: 'org-1', defaultSellerNip: '1234567890', ksefEnvironment: 'test' }

    em.findOne
      .mockResolvedValueOnce(invoice) // invoice lookup
      .mockResolvedValueOnce(settings) // settings lookup

    em.find.mockResolvedValue([]) // no line items

    await handle(makeJob() as never, ctx as never)

    expect(invoice.ksefStatus).toBe('error')
    expect(invoice.ksefErrorMessage).toBe('Invoice has no line items')
    expect(em.persist).toHaveBeenCalled()
    expect(buildFa3XmlMock).not.toHaveBeenCalled()
  })

  it('calls buildFa3Xml with invoice and line items', async () => {
    const invoice = makeInvoice()
    const lineItems = [
      { id: 'li-1', lineNumber: 1, description: 'Service A' },
      { id: 'li-2', lineNumber: 2, description: 'Service B' },
    ]
    const settings = { tenantId: 't1', organizationId: 'org-1', defaultSellerNip: '1234567890', ksefEnvironment: 'test' }

    em.findOne
      .mockResolvedValueOnce(invoice) // invoice
      .mockResolvedValueOnce(settings) // settings
      .mockResolvedValueOnce(null) // no active session

    em.find.mockResolvedValue(lineItems)

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elementReferenceNumber: 'ref-123',
        processingCode: 100,
      }),
    })

    await handle(makeJob() as never, ctx as never)

    expect(buildFa3XmlMock).toHaveBeenCalledWith(invoice, lineItems, { correctedKsefNumber: null })
    expect(invoice.ksefFaXml).toBe('<Faktura>test</Faktura>')
    expect(invoice.ksefStatus).toBe('submitted')
    expect(invoice.ksefReferenceNumber).toBe('ref-123')
  })

  it('skips invoice that is not in queued status', async () => {
    const invoice = makeInvoice({ ksefStatus: 'submitted' })
    em.findOne.mockResolvedValueOnce(invoice)

    await handle(makeJob() as never, ctx as never)

    expect(buildFa3XmlMock).not.toHaveBeenCalled()
    expect(em.persist).not.toHaveBeenCalled()
  })

  it('skips when invoice not found', async () => {
    em.findOne.mockResolvedValue(null)

    await handle(makeJob() as never, ctx as never)

    expect(buildFa3XmlMock).not.toHaveBeenCalled()
  })
})
