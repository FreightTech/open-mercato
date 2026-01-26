import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { pdfPreviewSchema } from '../../data/validators'
import { previewTemplate, SAMPLE_DATA } from '../../lib/template-renderer'
import { getDefaultTemplate } from '../../lib/default-templates'
import type { PdfTemplateType } from '../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['pdf_templates.view'] },
  GET: { requireAuth: true, requireFeatures: ['pdf_templates.view'] },
}

export async function POST(req: Request) {
  try {
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)
    const { translate } = await resolveTranslations()

    if (!auth || !auth.tenantId) {
      throw new CrudHttpError(401, { error: translate('pdf_templates.errors.unauthorized', 'Unauthorized') })
    }

    const payload = await req.json().catch(() => ({}))
    const input = pdfPreviewSchema.parse(payload)

    // Use provided variables or sample data
    const variables = input.variables || SAMPLE_DATA[input.templateType]

    const html = await previewTemplate({
      templateType: input.templateType,
      htmlTemplate: input.htmlTemplate,
      cssStyles: input.cssStyles || '',
      variables,
      settings: input.settings,
    })

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 })
    }
    const { translate } = await resolveTranslations()
    console.error('pdf_templates.preview failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.preview_failed', 'Failed to generate preview') },
      { status: 400 }
    )
  }
}

/**
 * GET endpoint to preview default template with sample data
 */
export async function GET(req: Request) {
  try {
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)
    const { translate } = await resolveTranslations()

    if (!auth || !auth.tenantId) {
      throw new CrudHttpError(401, { error: translate('pdf_templates.errors.unauthorized', 'Unauthorized') })
    }

    const url = new URL(req.url)
    const templateType = url.searchParams.get('type') as PdfTemplateType | null

    if (!templateType || !['offer'].includes(templateType)) {
      throw new CrudHttpError(400, {
        error: translate('pdf_templates.errors.invalid_type', 'Invalid template type. Must be: offer'),
      })
    }

    const defaultTemplate = getDefaultTemplate(templateType)
    const variables = SAMPLE_DATA[templateType]

    const html = await previewTemplate({
      templateType,
      htmlTemplate: defaultTemplate.htmlTemplate,
      cssStyles: defaultTemplate.cssStyles,
      variables,
    })

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('pdf_templates.preview.get failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.preview_failed', 'Failed to generate preview') },
      { status: 400 }
    )
  }
}

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'PDF Templates',
  summary: 'PDF template preview',
  methods: {
    GET: {
      summary: 'Preview default template with sample data',
      responses: [
        { status: 200, description: 'HTML preview of the template' },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid type', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Preview custom template',
      requestBody: {
        contentType: 'application/json',
        schema: pdfPreviewSchema,
      },
      responses: [
        { status: 200, description: 'HTML preview of the template' },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
      ],
    },
  },
}
