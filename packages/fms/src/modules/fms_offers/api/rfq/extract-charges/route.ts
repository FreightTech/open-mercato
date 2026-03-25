import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { chargeExtractionInputSchema, chargeExtractionChargeSchema } from '../../../data/validators'
import { extractChargesFromText } from '../../../lib/rfq-extraction.service'

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const validation = chargeExtractionInputSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  try {
    const result = await extractChargesFromText(validation.data.text, validation.data.transportMode, validation.data.imageBase64)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[rfq/extract-charges] error:', error)

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
      { error: 'Failed to extract charge data', message: error.message },
      { status: 500 },
    )
  }
}

const chargeExtractionResponseSchema = z.object({
  charges: z.array(chargeExtractionChargeSchema),
  sourceTitle: z.string().nullable().optional(),
  sourceSummary: z.string().nullable().optional(),
  model: z.string(),
  tokens: z.number(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Offers',
  summary: 'Charge line extraction from carrier rate text or image',
  methods: {
    POST: {
      summary: 'Extract charge lines from carrier rate text or image',
      description: 'Uses an LLM to extract structured freight charge lines (product name, charge code, basis, currency, rate, buy price, category) from raw carrier rate text or an image screenshot. Does not persist anything.',
      requestBody: {
        contentType: 'application/json',
        schema: chargeExtractionInputSchema,
      },
      responses: [
        { status: 200, description: 'Extraction result', schema: chargeExtractionResponseSchema },
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
