import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@open-mercato/core/modules/inbox_ops/lib/emailParser', () => ({
  parseInboundEmail: vi.fn(),
}))
vi.mock('../rfq-extraction.service', () => ({
  extractRfqFromText: vi.fn(),
}))

import { parseInboundEmail } from '@open-mercato/core/modules/inbox_ops/lib/emailParser'
import { extractRfqFromText } from '../rfq-extraction.service'
import { processEmailToRfq } from '../rfq-email-intake.service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'a0000000-0000-4000-8000-000000000001'
const ORG_ID = 'b0000000-0000-4000-8000-000000000002'

const LOC_GDANSK_ID = 'c0000000-0000-4000-8000-000000000010'
const LOC_HAMBURG_ID = 'c0000000-0000-4000-8000-000000000011'

const CONTRACTOR_ID = 'd0000000-0000-4000-8000-000000000020'
const CONTACT_ID = 'e0000000-0000-4000-8000-000000000030'

function mockLocations() {
  return [
    {
      id: LOC_GDANSK_ID,
      name: 'Gdańsk DCT',
      code: 'GDN-DCT',
      city: 'Gdańsk',
      country: 'PL',
      locode: 'PLGDN',
      type: 'port',
      isActive: true,
      organizationId: ORG_ID,
      tenantId: TENANT_ID,
      deletedAt: null,
    },
    {
      id: LOC_HAMBURG_ID,
      name: 'Hamburg HHLA',
      code: 'HAM-HHLA',
      city: 'Hamburg',
      country: 'DE',
      locode: 'DEHAM',
      type: 'port',
      isActive: true,
      organizationId: ORG_ID,
      tenantId: TENANT_ID,
      deletedAt: null,
    },
  ]
}

function mockContractors() {
  return [
    {
      id: CONTRACTOR_ID,
      name: 'ACME Logistics',
      shortName: 'ACME',
      isActive: true,
      organizationId: ORG_ID,
      tenantId: TENANT_ID,
      deletedAt: null,
      contacts: {
        getItems: () => [
          {
            id: CONTACT_ID,
            firstName: 'Jan',
            lastName: 'Kowalski',
            email: 'jan.kowalski@acme-logistics.pl',
            isActive: true,
          },
          {
            id: 'e0000000-0000-4000-8000-000000000031',
            firstName: 'Anna',
            lastName: 'Nowak',
            email: 'anna.nowak@acme-logistics.pl',
            isActive: true,
          },
        ],
      },
    },
  ]
}

function mockExtractionResult(overrides?: Record<string, unknown>) {
  return {
    extraction: {
      companyName: 'ACME Logistics',
      contactPerson: 'Jan Kowalski',
      senderEmail: 'jan.kowalski@acme-logistics.pl',
      direction: 'export',
      summary: '40HC Gdańsk → Hamburg, general cargo 18t',
      confidence: 0.92,
      items: [
        {
          containerType: '40HC',
          containerCount: 1,
          origin: 'Gdańsk',
          destination: 'Hamburg',
          cargoDescription: 'General cargo',
          weightKg: 18000,
          readinessDate: 'week 16',
          incoterm: 'fob',
          transportMode: 'sea',
          notes: null,
        },
      ],
      highlights: [
        { start: 10, end: 14, type: 'container' as const, label: '40HC' },
        { start: 15, end: 21, type: 'location' as const, label: 'Gdańsk' },
      ],
    },
    model: 'openai:gpt-4o',
    tokens: 450,
  }
}

function mockParsedEmail(overrides?: Record<string, unknown>) {
  return {
    messageId: null,
    from: { name: 'Jan Kowalski', email: 'jan.kowalski@acme-logistics.pl' },
    to: [{ email: 'rfq@freighttech.org' }],
    subject: 'Zapytanie 40HC Gdańsk → Hamburg',
    replyTo: null,
    inReplyTo: null,
    references: null,
    rawText: 'Dzień dobry, proszę o wycenę 40HC Gdańsk → Hamburg, ładunek ogólny 18t, gotowość tydzień 16.',
    rawHtml: null,
    cleanedText: 'Dzień dobry, proszę o wycenę 40HC Gdańsk → Hamburg, ładunek ogólny 18t, gotowość tydzień 16.',
    threadMessages: [],
    detectedLanguage: null,
    contentHash: 'abc123',
    ...overrides,
  }
}

function createMockEm(locations = mockLocations(), contractors = mockContractors()) {
  const em = {
    find: vi.fn().mockImplementation((entity: unknown) => {
      const entityName = (entity as any)?.name ?? String(entity)
      if (entityName === 'FmsLocation') return Promise.resolve(locations)
      if (entityName === 'Contractor') return Promise.resolve(contractors)
      return Promise.resolve([])
    }),
    fork: vi.fn(),
  }
  em.fork.mockReturnValue(em)
  return em
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processEmailToRfq', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs the full pipeline: clean → extract → match → build', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)
    vi.mocked(extractRfqFromText).mockResolvedValue(mockExtractionResult() as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      {
        from: 'Jan Kowalski <jan.kowalski@acme-logistics.pl>',
        subject: 'Zapytanie 40HC Gdańsk → Hamburg',
        text: 'Dzień dobry, proszę o wycenę 40HC...',
      },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    // Email was parsed
    expect(parseInboundEmail).toHaveBeenCalledOnce()

    // LLM extraction was called with cleaned text
    expect(extractRfqFromText).toHaveBeenCalledWith(
      'Dzień dobry, proszę o wycenę 40HC Gdańsk → Hamburg, ładunek ogólny 18t, gotowość tydzień 16.',
    )

    // Entity catalog was loaded
    expect(em.find).toHaveBeenCalledTimes(2) // locations + contractors

    // RFQ input was built correctly
    expect(result.rfqInput.title).toBe('Zapytanie 40HC Gdańsk → Hamburg')
    expect(result.rfqInput.companyName).toBe('ACME Logistics')
    expect(result.rfqInput.contractorId).toBe(CONTRACTOR_ID)
    expect(result.rfqInput.contactPersonId).toBe(CONTACT_ID)
    expect(result.rfqInput.senderEmail).toBe('jan.kowalski@acme-logistics.pl')
    expect(result.rfqInput.senderName).toBe('Jan Kowalski')
    expect(result.rfqInput.direction).toBe('export')
    expect(result.rfqInput.origin).toBe('Gdańsk')
    expect(result.rfqInput.destination).toBe('Hamburg')
    expect(result.rfqInput.originLocationId).toBe(LOC_GDANSK_ID)
    expect(result.rfqInput.destinationLocationId).toBe(LOC_HAMBURG_ID)
    expect(result.rfqInput.items).toHaveLength(1)
    expect(result.rfqInput.items[0].originLocationId).toBe(LOC_GDANSK_ID)
    expect(result.rfqInput.items[0].destinationLocationId).toBe(LOC_HAMBURG_ID)
    expect(result.rfqInput.rawText).toBeTruthy()
    expect(result.rfqInput.highlights).toHaveLength(2)
  })

  it('matches contractor by email domain', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)
    vi.mocked(extractRfqFromText).mockResolvedValue(mockExtractionResult() as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { from: 'jan.kowalski@acme-logistics.pl', text: 'some text' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    const contractorMatch = result.matches.find((m) => m.field === 'contractorId')
    expect(contractorMatch).toBeDefined()
    expect(contractorMatch!.entityId).toBe(CONTRACTOR_ID)
    expect(contractorMatch!.confidence).toBe(0.9)
    expect(contractorMatch!.matchedOn).toContain('email-domain')
  })

  it('matches contact person by exact email', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)
    vi.mocked(extractRfqFromText).mockResolvedValue(mockExtractionResult() as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { from: 'jan.kowalski@acme-logistics.pl', text: 'some text' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    const contactMatch = result.matches.find((m) => m.field === 'contactPersonId')
    expect(contactMatch).toBeDefined()
    expect(contactMatch!.entityId).toBe(CONTACT_ID)
    expect(contactMatch!.confidence).toBe(0.95)
    expect(contactMatch!.matchedOn).toContain('email')
  })

  it('matches locations by city name', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)
    vi.mocked(extractRfqFromText).mockResolvedValue(mockExtractionResult() as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { from: 'someone@test.com', text: 'some text' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    const originMatch = result.matches.find((m) => m.field === 'originLocationId')
    const destMatch = result.matches.find((m) => m.field === 'destinationLocationId')
    expect(originMatch).toBeDefined()
    expect(originMatch!.entityId).toBe(LOC_GDANSK_ID)
    expect(destMatch).toBeDefined()
    expect(destMatch!.entityId).toBe(LOC_HAMBURG_ID)
  })

  it('handles no entity matches gracefully', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)
    vi.mocked(extractRfqFromText).mockResolvedValue(
      mockExtractionResult({
        companyName: 'Unknown Corp',
        senderEmail: 'nobody@unknown.com',
      }) as any,
    )
    const em = createMockEm([], []) // empty catalogs

    const result = await processEmailToRfq(
      { from: 'nobody@unknown.com', text: 'some text' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    expect(result.matches).toHaveLength(0)
    expect(result.rfqInput.contractorId).toBeNull()
    expect(result.rfqInput.contactPersonId).toBeNull()
    expect(result.rfqInput.originLocationId).toBeNull()
    expect(result.rfqInput.destinationLocationId).toBeNull()
    // RFQ input should still be populated from extraction
    expect(result.rfqInput.rawText).toBeTruthy()
    expect(result.rfqInput.items).toHaveLength(1)
  })

  it('throws when email has no extractable text', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(
      mockParsedEmail({ cleanedText: '' }) as any,
    )

    const em = createMockEm()

    await expect(
      processEmailToRfq({ text: '' }, em as any, TENANT_ID, ORG_ID),
    ).rejects.toThrow('no extractable text')
  })

  it('falls back to email subject for title when present', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)
    vi.mocked(extractRfqFromText).mockResolvedValue(mockExtractionResult() as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { from: 'test@test.com', subject: 'My Custom Subject', text: 'body' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    expect(result.rfqInput.title).toBe('My Custom Subject')
  })

  it('uses extraction summary as title when no subject', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(
      mockParsedEmail({ subject: '(no subject)' }) as any,
    )
    vi.mocked(extractRfqFromText).mockResolvedValue(mockExtractionResult() as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { text: 'body' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    expect(result.rfqInput.title).toBe('40HC Gdańsk → Hamburg, general cargo 18t')
  })

  it('prefers email header sender over LLM-extracted sender', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(
      mockParsedEmail({
        from: { name: 'Header Name', email: 'header@acme-logistics.pl' },
      }) as any,
    )
    vi.mocked(extractRfqFromText).mockResolvedValue(mockExtractionResult() as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { from: 'Header Name <header@acme-logistics.pl>', text: 'body' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    expect(result.rfqInput.senderEmail).toBe('header@acme-logistics.pl')
    expect(result.rfqInput.senderName).toBe('Header Name')
  })

  it('loads entity catalog and LLM extraction in parallel', async () => {
    const callOrder: string[] = []

    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)

    const em = createMockEm()
    const origFind = em.find
    em.find = vi.fn().mockImplementation(async (...args: unknown[]) => {
      callOrder.push('catalog')
      return origFind(...args as [unknown])
    }) as any

    vi.mocked(extractRfqFromText).mockImplementation(async () => {
      callOrder.push('extraction')
      return mockExtractionResult() as any
    })

    await processEmailToRfq(
      { from: 'test@test.com', text: 'body' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    // Both should have been called (order doesn't matter for parallel, but both must run)
    expect(callOrder).toContain('catalog')
    expect(callOrder).toContain('extraction')
  })

  it('includes extraction metadata in rfqInput.extractedData', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)
    vi.mocked(extractRfqFromText).mockResolvedValue(mockExtractionResult() as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { from: 'test@test.com', text: 'body' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    expect(result.rfqInput.extractedData).toEqual({
      model: 'openai:gpt-4o',
      tokens: 450,
      confidence: 0.92,
    })
  })

  it('matches items locations independently per item', async () => {
    const multiItemExtraction = mockExtractionResult()
    multiItemExtraction.extraction.items = [
      {
        containerType: '40HC',
        containerCount: 1,
        origin: 'Gdańsk',
        destination: 'Hamburg',
        cargoDescription: 'Cargo A',
        weightKg: 10000,
        readinessDate: null,
        incoterm: null,
        transportMode: 'sea',
        notes: null,
      },
      {
        containerType: '20GP',
        containerCount: 2,
        origin: 'Hamburg',
        destination: 'Gdańsk',
        cargoDescription: 'Cargo B',
        weightKg: 5000,
        readinessDate: null,
        incoterm: null,
        transportMode: 'sea',
        notes: null,
      },
    ]

    vi.mocked(parseInboundEmail).mockReturnValue(mockParsedEmail() as any)
    vi.mocked(extractRfqFromText).mockResolvedValue(multiItemExtraction as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { from: 'test@test.com', text: 'body' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    expect(result.rfqInput.items).toHaveLength(2)
    // First item: Gdańsk → Hamburg
    expect(result.rfqInput.items[0].originLocationId).toBe(LOC_GDANSK_ID)
    expect(result.rfqInput.items[0].destinationLocationId).toBe(LOC_HAMBURG_ID)
    // Second item: Hamburg → Gdańsk (reversed)
    expect(result.rfqInput.items[1].originLocationId).toBe(LOC_HAMBURG_ID)
    expect(result.rfqInput.items[1].destinationLocationId).toBe(LOC_GDANSK_ID)
  })

  it('matches contractor by company name when no email domain match', async () => {
    vi.mocked(parseInboundEmail).mockReturnValue(
      mockParsedEmail({
        from: { name: 'Someone', email: 'someone@gmail.com' },
      }) as any,
    )
    const extraction = mockExtractionResult()
    extraction.extraction.companyName = 'ACME Logistics'
    extraction.extraction.senderEmail = 'someone@gmail.com'
    vi.mocked(extractRfqFromText).mockResolvedValue(extraction as any)
    const em = createMockEm()

    const result = await processEmailToRfq(
      { from: 'someone@gmail.com', text: 'body' },
      em as any,
      TENANT_ID,
      ORG_ID,
    )

    const contractorMatch = result.matches.find((m) => m.field === 'contractorId')
    expect(contractorMatch).toBeDefined()
    expect(contractorMatch!.entityId).toBe(CONTRACTOR_ID)
    expect(contractorMatch!.confidence).toBe(0.85)
    expect(contractorMatch!.matchedOn).toContain('exact-name')
  })
})
