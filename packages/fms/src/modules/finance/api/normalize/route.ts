import { NextRequest, NextResponse } from 'next/server'
import { normalizeInvoiceRequestSchema } from '../../data/validators'
import {
  FinanceExtractionService,
  FinanceExtractionError,
  FinanceExtractionTimeoutError,
  FinanceExtractionValidationError,
} from '../../services/finance-extraction.service'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['finance.normalize'] },
}

/**
 * POST /api/finance/normalize
 *
 * Normalize extracted invoice data (Polish invoice formats)
 */
export async function POST(req: NextRequest, context: any) {
  try {
    const authContext = context?.auth ?? {}
    const { email, actorOrgId, actorTenantId } = authContext

    if (!email || !actorOrgId || !actorTenantId) {
      return NextResponse.json({ error: 'Missing authentication context' }, { status: 401 })
    }

    const body = await req.json()

    const parseResult = normalizeInvoiceRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.format(),
        },
        { status: 400 }
      )
    }

    const { data, schemaConfig } = parseResult.data

    // Get auth token from request headers to forward to external API
    const authHeader = req.headers.get('authorization')
    const authToken = authHeader?.replace('Bearer ', '')

    const service = new FinanceExtractionService()
    const result = await service.normalizeInvoice(data, schemaConfig, authToken)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[finance/normalize] Normalization failed:', error)

    if (error instanceof FinanceExtractionTimeoutError) {
      return NextResponse.json(
        {
          error: 'Normalization timed out',
          details: 'The normalization process took too long. Please try again.',
        },
        { status: 504 }
      )
    }

    if (error instanceof FinanceExtractionValidationError) {
      return NextResponse.json(
        {
          error: 'Invalid response from normalization service',
          details: error.message,
        },
        { status: 502 }
      )
    }

    if (error instanceof FinanceExtractionError) {
      if (error.statusCode === 401) {
        return NextResponse.json(
          {
            error: 'Authentication failed with normalization service',
            details: error.details,
          },
          { status: 401 }
        )
      }

      return NextResponse.json(
        {
          error: 'Normalization service error',
          details: error.message,
          code: error.code,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred during normalization' },
      { status: 500 }
    )
  }
}
