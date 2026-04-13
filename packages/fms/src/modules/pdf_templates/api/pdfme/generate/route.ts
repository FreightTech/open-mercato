import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { pdfmeGenerateSchema } from '../../../data/validators'
import { PdfmeTemplate, type PdfTemplateType } from '../../../data/entities'
import { generatePdfBuffer } from '../../../lib/pdfme-generator'
import { getDefaultPdfmeTemplate } from '../../../lib/default-pdfme-templates'
import { applyBrandColors } from '../../../lib/apply-brand-colors'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['pdf_templates.view'] },
}

/**
 * POST /api/pdf_templates/pdfme/generate
 * 
 * Generate a PDF using pdfme.
 * 
 * Request body:
 * - templateId: UUID of a saved template (optional)
 * - templateType: type of template to use if no templateId (e.g., 'offer')
 * - templateJson: inline template JSON (optional, overrides templateId/templateType)
 * - inputs: array of input objects mapping schema names to values
 */
export async function POST(req: Request) {
  try {
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)
    const { translate } = await resolveTranslations()

    if (!auth || !auth.tenantId) {
      throw new CrudHttpError(401, { error: translate('pdf_templates.errors.unauthorized', 'Unauthorized') })
    }

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const organizationId = scope?.selectedId ?? auth.orgId ?? null

    if (!organizationId) {
      throw new CrudHttpError(400, {
        error: translate('pdf_templates.errors.organization_required', 'Organization context is required'),
      })
    }

    const em = container.resolve('em') as EntityManager
    const payload = await req.json().catch(() => ({}))
    const input = pdfmeGenerateSchema.parse(payload)

    let templateJson = input.templateJson

    // If no inline template, load from database or use default
    if (!templateJson) {
      if (input.templateId) {
        // Load by ID
        const template = await em.findOne(PdfmeTemplate, {
          id: input.templateId,
          tenantId: auth.tenantId,
          organizationId,
          deletedAt: null,
        })

        if (!template) {
          throw new CrudHttpError(404, {
            error: translate('pdf_templates.errors.not_found', 'Template not found'),
          })
        }

        templateJson = template.templateJson
      } else if (input.templateType) {
        // Load by type or use default
        const template = await em.findOne(PdfmeTemplate, {
          templateType: input.templateType,
          tenantId: auth.tenantId,
          organizationId,
          isActive: true,
          deletedAt: null,
        })

        if (template) {
          templateJson = template.templateJson
        } else {
          // Use default template
          templateJson = getDefaultPdfmeTemplate(input.templateType)
        }
      } else {
        throw new CrudHttpError(400, {
          error: translate(
            'pdf_templates.errors.template_required',
            'Either templateId, templateType, or templateJson is required'
          ),
        })
      }
    }

    // Load brand settings and apply colors/logo to the template
    let brandedTemplate = templateJson
    try {
      const settingsRows = await em.getConnection().execute(
        `SELECT primary_color, accent_color, company_logo_url
         FROM fms_email_settings
         WHERE tenant_id = ? AND organization_id = ?
         LIMIT 1`,
        [auth.tenantId, organizationId],
      )
      console.log('[pdfme/generate] brand query result:', settingsRows.length, 'rows', settingsRows.length > 0 ? { primary: settingsRows[0].primary_color, accent: settingsRows[0].accent_color } : '(empty)')
      if (settingsRows.length > 0) {
        brandedTemplate = applyBrandColors(templateJson, {
          primaryColor: settingsRows[0].primary_color || null,
          accentColor: settingsRows[0].accent_color || null,
        })
      }
    } catch (brandErr) {
      console.error('[pdfme/generate] brand settings query failed:', brandErr)
    }

    // Generate PDF
    const pdfBuffer = await generatePdfBuffer(brandedTemplate, input.inputs)

    // Return PDF as binary response
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="document.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
    }
    const { translate } = await resolveTranslations()
    console.error('pdfme.generate failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.generate_failed', 'Failed to generate PDF') },
      { status: 500 }
    )
  }
}

// OpenAPI documentation
const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'PDF Templates (pdfme)',
  summary: 'Generate PDF using pdfme',
  methods: {
    POST: {
      summary: 'Generate PDF from template',
      requestBody: {
        contentType: 'application/json',
        schema: pdfmeGenerateSchema,
      },
      responses: [
        { status: 200, description: 'PDF binary', mediaType: 'application/pdf' },
        { status: 404, description: 'Template not found', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid request', schema: errorSchema },
        { status: 500, description: 'Generation failed', schema: errorSchema },
      ],
    },
  },
}
