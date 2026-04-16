import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: vi.fn(),
}))
vi.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: vi.fn(),
}))
vi.mock('@open-mercato/core/modules/directory/utils/organizationScope', () => ({
  resolveOrganizationScopeForRequest: vi.fn(),
}))
vi.mock('../../../../lib/rfq-email-intake.service', () => ({
  processEmailToRfq: vi.fn(),
}))

import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { processEmailToRfq } from '../../../../lib/rfq-email-intake.service'
import { POST } from '../route'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'a0000000-0000-4000-8000-000000000001'
const ORG_ID = 'b0000000-0000-4000-8000-000000000002'
const USER_ID = 'f0000000-0000-4000-8000-000000000040'
const RFQ_ID = 'g0000000-0000-4000-8000-000000000050'
const ITEM_ID = 'h0000000-0000-4000-8000-000000000060'

function createMockRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/rfq/from-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockAuth() {
  return {
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    userId: USER_ID,
    sub: USER_ID,
  }
}

function mockIntakeResult() {
  return {
    rfqInput: {
      title: 'Zapytanie 40HC Gdańsk → Hamburg',
      description: '40HC export Gdańsk to Hamburg',
      origin: 'Gdańsk',
      destination: 'Hamburg',
      originLocationId: 'c0000000-0000-4000-8000-000000000010',
      destinationLocationId: 'c0000000-0000-4000-8000-000000000011',
      direction: 'export',
      transportMode: 'sea',
      companyName: 'ACME Logistics',
      contractorId: 'd0000000-0000-4000-8000-000000000020',
      contactPerson: 'Jan Kowalski',
      contactPersonId: 'e0000000-0000-4000-8000-000000000030',
      senderEmail: 'jan.kowalski@acme-logistics.pl',
      senderName: 'Jan Kowalski',
      rawText: 'Cleaned email text...',
      extractedData: { model: 'openai:gpt-4o', tokens: 450, confidence: 0.92 },
      highlights: [{ start: 0, end: 4, type: 'container', label: '40HC' }],
      items: [
        {
          containerType: '40HC',
          containerCount: 1,
          origin: 'Gdańsk',
          destination: 'Hamburg',
          originLocationId: 'c0000000-0000-4000-8000-000000000010',
          destinationLocationId: 'c0000000-0000-4000-8000-000000000011',
          cargoDescription: 'General cargo',
          weightKg: 18000,
          readinessDate: 'week 16',
          incoterm: 'fob',
          transportMode: 'sea',
          notes: null,
        },
      ],
    },
    extraction: {
      extraction: { confidence: 0.92 },
      model: 'openai:gpt-4o',
      tokens: 450,
    },
    matches: [
      {
        field: 'contractorId',
        entityId: 'd0000000-0000-4000-8000-000000000020',
        entityName: 'ACME Logistics',
        confidence: 0.9,
        matchedOn: 'email-domain:acme-logistics.pl',
      },
    ],
  }
}

function createMockContainer() {
  const mockRfq = { id: RFQ_ID, title: 'Zapytanie 40HC Gdańsk → Hamburg', status: 'incoming' }
  const mockItems = [{ id: ITEM_ID, containerType: '40HC', itemNumber: 1 }]

  const mockEm = {
    findOne: vi.fn().mockResolvedValue(mockRfq),
    find: vi.fn().mockResolvedValue(mockItems),
    fork: vi.fn(),
  }
  mockEm.fork.mockReturnValue(mockEm)

  const mockCommandBus = {
    execute: vi.fn().mockResolvedValue({ result: { rfqId: RFQ_ID } }),
  }

  return {
    resolve: vi.fn((token: string) => {
      if (token === 'em') return mockEm
      if (token === 'commandBus') return mockCommandBus
      return undefined
    }),
    _em: mockEm,
    _commandBus: mockCommandBus,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/rfq/from-email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null as any)

    const res = await POST(createMockRequest({ text: 'hello' }) as any)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 when neither text nor html is provided', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)

    const res = await POST(createMockRequest({ from: 'test@test.com' }) as any)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid input')
  })

  it('returns 400 when organization context is missing', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue({
      tenantId: null,
      orgId: null,
      userId: USER_ID,
    } as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue(null as any)
    vi.mocked(createRequestContainer).mockResolvedValue({
      resolve: vi.fn(),
    } as any)

    const res = await POST(createMockRequest({ text: 'hello' }) as any)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Organization and tenant context required')
  })

  it('returns 201 with RFQ, items, extraction, and matches on success', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)
    const container = createMockContainer()
    vi.mocked(createRequestContainer).mockResolvedValue(container as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue({
      selectedId: ORG_ID,
      filterIds: [ORG_ID],
    } as any)
    vi.mocked(processEmailToRfq).mockResolvedValue(mockIntakeResult() as any)

    const res = await POST(
      createMockRequest({
        from: 'jan.kowalski@acme-logistics.pl',
        subject: 'Zapytanie 40HC',
        text: 'Dzień dobry, proszę o wycenę...',
      }) as any,
    )

    expect(res.status).toBe(201)
    const body = await res.json()

    // RFQ was created
    expect(body.rfq).toBeDefined()
    expect(body.rfq.id).toBe(RFQ_ID)

    // Items returned
    expect(body.items).toBeDefined()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe(ITEM_ID)

    // Extraction metadata
    expect(body.extraction).toEqual({
      model: 'openai:gpt-4o',
      tokens: 450,
      confidence: 0.92,
    })

    // Entity matches
    expect(body.matches).toHaveLength(1)
    expect(body.matches[0].field).toBe('contractorId')
    expect(body.matches[0].confidence).toBe(0.9)
  })

  it('passes correct input to processEmailToRfq', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)
    const container = createMockContainer()
    vi.mocked(createRequestContainer).mockResolvedValue(container as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue({
      selectedId: ORG_ID,
      filterIds: [ORG_ID],
    } as any)
    vi.mocked(processEmailToRfq).mockResolvedValue(mockIntakeResult() as any)

    await POST(
      createMockRequest({
        from: 'jan@acme.pl',
        subject: 'Test',
        text: 'Body text',
        html: '<p>Body html</p>',
      }) as any,
    )

    expect(processEmailToRfq).toHaveBeenCalledOnce()
    const [emailInput, , tenantId, orgId] = vi.mocked(processEmailToRfq).mock.calls[0]
    expect(emailInput).toMatchObject({
      from: 'jan@acme.pl',
      subject: 'Test',
      text: 'Body text',
      html: '<p>Body html</p>',
    })
    expect(tenantId).toBe(TENANT_ID)
    expect(orgId).toBe(ORG_ID)
  })

  it('executes createRfqCommand with correct input', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)
    const container = createMockContainer()
    vi.mocked(createRequestContainer).mockResolvedValue(container as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue({
      selectedId: ORG_ID,
      filterIds: [ORG_ID],
    } as any)
    vi.mocked(processEmailToRfq).mockResolvedValue(mockIntakeResult() as any)

    await POST(createMockRequest({ text: 'body' }) as any)

    expect(container._commandBus.execute).toHaveBeenCalledOnce()
    const [commandId, payload] = container._commandBus.execute.mock.calls[0]
    expect(commandId).toBe('fms_offers.rfq.create')
    expect(payload.input.organizationId).toBe(ORG_ID)
    expect(payload.input.tenantId).toBe(TENANT_ID)
    expect(payload.input.status).toBe('incoming')
    expect(payload.input.assignedToId).toBe(USER_ID)
    expect(payload.input.contractorId).toBe('d0000000-0000-4000-8000-000000000020')
    expect(payload.input.items).toHaveLength(1)
  })

  it('returns 503 when AI provider is not configured', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)
    const container = createMockContainer()
    vi.mocked(createRequestContainer).mockResolvedValue(container as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue({
      selectedId: ORG_ID,
      filterIds: [ORG_ID],
    } as any)
    vi.mocked(processEmailToRfq).mockRejectedValue(new Error('Missing API key for provider "openai"'))

    const res = await POST(createMockRequest({ text: 'body' }) as any)

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('AI provider not configured')
  })

  it('returns 504 on extraction timeout', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)
    const container = createMockContainer()
    vi.mocked(createRequestContainer).mockResolvedValue(container as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue({
      selectedId: ORG_ID,
      filterIds: [ORG_ID],
    } as any)
    vi.mocked(processEmailToRfq).mockRejectedValue(new Error('RFQ extraction timed out after 120000ms'))

    const res = await POST(createMockRequest({ text: 'body' }) as any)

    expect(res.status).toBe(504)
    const body = await res.json()
    expect(body.error).toContain('timed out')
  })

  it('returns 422 when email has no extractable text', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)
    const container = createMockContainer()
    vi.mocked(createRequestContainer).mockResolvedValue(container as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue({
      selectedId: ORG_ID,
      filterIds: [ORG_ID],
    } as any)
    vi.mocked(processEmailToRfq).mockRejectedValue(
      new Error('Email contains no extractable text content'),
    )

    const res = await POST(createMockRequest({ text: '   ' }) as any)

    expect(res.status).toBe(422)
  })

  it('returns 500 on unexpected errors', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)
    const container = createMockContainer()
    vi.mocked(createRequestContainer).mockResolvedValue(container as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue({
      selectedId: ORG_ID,
      filterIds: [ORG_ID],
    } as any)
    vi.mocked(processEmailToRfq).mockRejectedValue(new Error('Database connection failed'))

    const res = await POST(createMockRequest({ text: 'body' }) as any)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to process email into RFQ')
    expect(body.message).toBe('Database connection failed')
  })

  it('accepts html-only email input (no text field)', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth() as any)
    const container = createMockContainer()
    vi.mocked(createRequestContainer).mockResolvedValue(container as any)
    vi.mocked(resolveOrganizationScopeForRequest).mockResolvedValue({
      selectedId: ORG_ID,
      filterIds: [ORG_ID],
    } as any)
    vi.mocked(processEmailToRfq).mockResolvedValue(mockIntakeResult() as any)

    const res = await POST(
      createMockRequest({ html: '<p>Hello</p>' }) as any,
    )

    expect(res.status).toBe(201)
    expect(processEmailToRfq).toHaveBeenCalledOnce()
  })
})
