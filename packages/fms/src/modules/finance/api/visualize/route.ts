import { NextRequest, NextResponse } from 'next/server'
import { visualizeRequestSchema } from '../../data/validators'
import {
  FinanceExtractionService,
  FinanceExtractionError,
  FinanceExtractionTimeoutError,
  FinanceExtractionValidationError,
} from '../../services/finance-extraction.service'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['finance.visualize'] },
}

/**
 * POST /api/finance/visualize
 *
 * Generate annotated invoice image with confidence colors
 */
export async function POST(req: NextRequest, context: any) {
  try {
    const authContext = context?.auth ?? {}
    const { email, actorOrgId, actorTenantId } = authContext

    if (!email || !actorOrgId || !actorTenantId) {
      return NextResponse.json({ error: 'Missing authentication context' }, { status: 401 })
    }

    const body = await req.json()

    const parseResult = visualizeRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.format(),
        },
        { status: 400 }
      )
    }

    const { fileUrl, validationResult, options, pageNum } = parseResult.data

    // Get auth token from request headers to forward to external API
    const authHeader = req.headers.get('authorization')
    const authToken = authHeader?.replace('Bearer ', '')

    const service = new FinanceExtractionService()
    const result = await service.visualizeResults(
      fileUrl,
      validationResult,
      options,
      pageNum,
      authToken
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[finance/visualize] Visualization failed:', error)

    if (error instanceof FinanceExtractionTimeoutError) {
      return NextResponse.json(
        {
          error: 'Visualization timed out',
          details: 'The visualization process took too long. Please try again.',
        },
        { status: 504 }
      )
    }

    if (error instanceof FinanceExtractionValidationError) {
      return NextResponse.json(
        {
          error: 'Invalid response from visualization service',
          details: error.message,
        },
        { status: 502 }
      )
    }

    if (error instanceof FinanceExtractionError) {
      if (error.statusCode === 401) {
        return NextResponse.json(
          {
            error: 'Authentication failed with visualization service',
            details: error.details,
          },
          { status: 401 }
        )
      }

      return NextResponse.json(
        {
          error: 'Visualization service error',
          details: error.message,
          code: error.code,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred during visualization' },
      { status: 500 }
    )
  }
}
