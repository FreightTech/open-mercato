import { NextRequest, NextResponse } from 'next/server'
import { validateExtractionRequestSchema } from '../../data/validators'
import {
  FinanceExtractionService,
  FinanceExtractionError,
  FinanceExtractionTimeoutError,
  FinanceExtractionValidationError,
} from '../../services/finance-extraction.service'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['finance.validate'] },
}

/**
 * POST /api/finance/validate
 *
 * Cross-validate extraction results using Claude as judge
 */
export async function POST(req: NextRequest, context: any) {
  try {
    const authContext = context?.auth ?? {}
    const { email, actorOrgId, actorTenantId } = authContext

    if (!email || !actorOrgId || !actorTenantId) {
      return NextResponse.json({ error: 'Missing authentication context' }, { status: 401 })
    }

    const body = await req.json()

    const parseResult = validateExtractionRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.format(),
        },
        { status: 400 }
      )
    }

    const { extractionResults, validationRules } = parseResult.data

    // Get auth token from request headers to forward to external API
    const authHeader = req.headers.get('authorization')
    const authToken = authHeader?.replace('Bearer ', '')

    const service = new FinanceExtractionService()
    const result = await service.validateExtraction(extractionResults, validationRules, authToken)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[finance/validate] Validation failed:', error)

    if (error instanceof FinanceExtractionTimeoutError) {
      return NextResponse.json(
        {
          error: 'Validation timed out',
          details: 'The validation process took too long. Please try again.',
        },
        { status: 504 }
      )
    }

    if (error instanceof FinanceExtractionValidationError) {
      return NextResponse.json(
        {
          error: 'Invalid response from validation service',
          details: error.message,
        },
        { status: 502 }
      )
    }

    if (error instanceof FinanceExtractionError) {
      if (error.statusCode === 401) {
        return NextResponse.json(
          {
            error: 'Authentication failed with validation service',
            details: error.details,
          },
          { status: 401 }
        )
      }

      return NextResponse.json(
        {
          error: 'Validation service error',
          details: error.message,
          code: error.code,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred during validation' },
      { status: 500 }
    )
  }
}
