import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

const feedbackSchema = z.object({
  rating: z.enum(['good', 'bad']),
  message: z.string().max(2000).optional().default(''),
  documentUrl: z.string().url(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: documentId } = await params
    const body = await request.json()
    const input = feedbackSchema.parse(body)

    const webhookUrl = process.env.DOCUMENT_FEEDBACK_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ success: true, message: 'Feedback received (no webhook configured)' })
    }

    const payload = {
      documentId,
      documentUrl: input.documentUrl,
      rating: input.rating,
      message: input.message,
      userId: auth.userId,
      organizationId: auth.organizationId,
      tenantId: auth.tenantId,
      timestamp: new Date().toISOString(),
    }

    // Fire and forget — don't block the response on webhook delivery
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.error('[fms-documents] Feedback webhook failed:', err.message)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    console.error('[fms-documents] Feedback error:', error)
    return NextResponse.json({ error: 'Failed to process feedback' }, { status: 500 })
  }
}

export const openApi = {
  POST: {
    summary: 'Submit extraction feedback for a document',
    tags: ['FMS Documents'],
    operationId: 'submitDocumentFeedback',
  },
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_documents.view'] },
}
