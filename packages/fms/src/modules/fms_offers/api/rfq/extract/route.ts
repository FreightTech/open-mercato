import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { rfqExtractionInputSchema } from '../../../data/validators'
import { extractRfqFromText } from '../../../lib/rfq-extraction.service'

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const validation = rfqExtractionInputSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  try {
    const result = await extractRfqFromText(validation.data.text)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[rfq/extract] error:', error)

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

    return NextResponse.json(
      { error: 'Failed to extract RFQ data', message: error.message },
      { status: 500 },
    )
  }
}

const extractionResponseSchema = z.object({
  extraction: z.object({
    companyName: z.string().nullable(),
    contactPerson: z.string().nullable(),
    senderEmail: z.string().nullable(),
    direction: z.string().nullable(),
    summary: z.string().nullable(),
    confidence: z.number(),
    items: z.array(z.object({
      containerType: z.string().nullable(),
      containerCount: z.number().nullable(),
      origin: z.string().nullable(),
      destination: z.string().nullable(),
      cargoDescription: z.string().nullable(),
      weightKg: z.number().nullable(),
      readinessDate: z.string().nullable(),
      incoterm: z.string().nullable(),
      transportMode: z.string().nullable(),
      notes: z.string().nullable(),
    })),
    highlights: z.array(z.object({
      start: z.number(),
      end: z.number(),
      type: z.string(),
      label: z.string(),
    })),
  }),
  model: z.string(),
  tokens: z.number(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Offers',
  summary: 'RFQ text extraction',
  methods: {
    POST: {
      summary: 'Extract structured RFQ data from text',
      description: 'Uses an LLM to extract structured freight data (company, routes, containers, cargo) from raw email/message text. Does not persist anything.',
      requestBody: {
        contentType: 'application/json',
        schema: rfqExtractionInputSchema,
      },
      responses: [
        { status: 200, description: 'Extraction result', schema: extractionResponseSchema },
        { status: 400, description: 'Invalid input', schema: z.object({ error: z.string() }) },
        { status: 401, description: 'Unauthorized', schema: z.object({ error: z.string() }) },
        { status: 503, description: 'AI provider not configured', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_offers.rfq.manage'] },
}
