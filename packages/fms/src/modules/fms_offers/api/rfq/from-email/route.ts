import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsRfq, FmsRfqItem } from '../../../data/entities'
import { processEmailToRfq, type EmailIntakeInput } from '../../../lib/rfq-email-intake.service'

const emailInputSchema = z.object({
  from: z.string().max(500).optional().nullable(),
  to: z.union([z.string().max(500), z.array(z.string().max(500))]).optional().nullable(),
  subject: z.string().max(1000).optional().nullable(),
  text: z.string().max(100_000).optional().nullable(),
  html: z.string().max(200_000).optional().nullable(),
}).refine(
  (data) => data.text || data.html,
  { message: 'Either text or html content is required' },
)

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const validation = emailInputSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  const em = (container.resolve('em') as EntityManager).fork()

  try {
    // Run the full email-to-RFQ pipeline: clean → extract → match → build
    const intake = await processEmailToRfq(
      validation.data as EmailIntakeInput,
      em,
      tenantId,
      selectedOrgId,
    )

    // Persist via the existing create command
    const commandBus = container.resolve('commandBus') as CommandBus
    const assignedToId = typeof auth.userId === 'string' ? auth.userId : null

    const { items, ...rfqFields } = intake.rfqInput
    const { result } = await commandBus.execute('fms_offers.rfq.create', {
      input: {
        ...rfqFields,
        status: 'incoming' as const,
        assignedToId,
        organizationId: selectedOrgId,
        tenantId,
        items,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId,
        organizationId: selectedOrgId,
        resourceKind: 'fms_offers.rfq',
      },
    })

    // Load the created RFQ with items for the response
    const resultEm = (container.resolve('em') as EntityManager).fork()
    const rfq = await resultEm.findOne(FmsRfq, { id: (result as { rfqId: string }).rfqId })
    const rfqItems = await resultEm.find(FmsRfqItem, {
      rfq: (result as { rfqId: string }).rfqId,
      deletedAt: null,
    }, { orderBy: { itemNumber: 'asc' } })

    return NextResponse.json({
      rfq,
      items: rfqItems,
      extraction: {
        model: intake.extraction.model,
        tokens: intake.extraction.tokens,
        confidence: intake.extraction.extraction.confidence,
      },
      matches: intake.matches,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[rfq/from-email] error:', error)

    if (error.message?.includes('Missing API key')) {
      return NextResponse.json(
        { error: 'AI provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in environment.' },
        { status: 503 },
      )
    }

    if (error.message?.includes('timed out')) {
      return NextResponse.json(
        { error: 'Extraction timed out. Please try again.' },
        { status: 504 },
      )
    }

    if (error.message?.includes('no extractable text')) {
      return NextResponse.json(
        { error: error.message },
        { status: 422 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to process email into RFQ', message: error.message },
      { status: 500 },
    )
  }
}

const matchSchema = z.object({
  field: z.string(),
  entityId: z.string().uuid(),
  entityName: z.string(),
  confidence: z.number(),
  matchedOn: z.string(),
})

const responseSchema = z.object({
  rfq: z.object({ id: z.string().uuid() }).passthrough(),
  items: z.array(z.object({ id: z.string().uuid() }).passthrough()),
  extraction: z.object({
    model: z.string(),
    tokens: z.number(),
    confidence: z.number().nullable(),
  }),
  matches: z.array(matchSchema),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Offers',
  summary: 'Create RFQ from email',
  methods: {
    POST: {
      summary: 'Create an RFQ from raw email content',
      description:
        'Single-step endpoint for email-to-RFQ conversion. Accepts raw email fields, ' +
        'cleans the text, extracts structured freight data via LLM, matches against ' +
        'tenant entities (locations, contractors), and persists the RFQ. ' +
        'Designed for n8n/webhook integration — replaces the two-call extract+create flow.',
      requestBody: {
        contentType: 'application/json',
        schema: emailInputSchema,
      },
      responses: [
        { status: 201, description: 'RFQ created with extraction and entity matches', schema: responseSchema },
        { status: 400, description: 'Invalid input', schema: z.object({ error: z.string() }) },
        { status: 401, description: 'Unauthorized', schema: z.object({ error: z.string() }) },
        { status: 422, description: 'No extractable text content', schema: z.object({ error: z.string() }) },
        { status: 503, description: 'AI provider not configured', schema: z.object({ error: z.string() }) },
        { status: 504, description: 'Extraction timed out', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_offers.rfq.manage'] },
}
