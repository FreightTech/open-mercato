import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { documentTemplateGenerateSchema } from '../../../data/validators'
import { DocumentTemplate } from '../../../data/entities'
import { generatePdfBuffer } from '../../../lib/pdfme-generator'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['templating.view'] },
}

export async function POST(req: Request) {
  try {
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)

    if (!auth || !auth.tenantId) {
      throw new CrudHttpError(401, { error: 'Unauthorized' })
    }

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const organizationId = scope?.selectedId ?? auth.orgId ?? null

    if (!organizationId) {
      throw new CrudHttpError(400, { error: 'Organization context is required' })
    }

    const em = container.resolve('em') as EntityManager
    const payload = await req.json().catch(() => ({}))
    const input = documentTemplateGenerateSchema.parse(payload)

    let templateJson = input.templateJson

    if (!templateJson) {
      if (input.templateId) {
        const template = await em.findOne(DocumentTemplate, {
          id: input.templateId,
          tenantId: auth.tenantId,
          organizationId,
          deletedAt: null,
        })

        if (!template) {
          throw new CrudHttpError(404, { error: 'Template not found' })
        }

        templateJson = template.templateJson
      } else if (input.templateType) {
        const template = await em.findOne(DocumentTemplate, {
          templateType: input.templateType,
          tenantId: auth.tenantId,
          organizationId,
          isActive: true,
          deletedAt: null,
        })

        if (!template) {
          throw new CrudHttpError(404, { error: 'No template found for this type' })
        }

        templateJson = template.templateJson
      } else {
        throw new CrudHttpError(400, { error: 'Either templateId, templateType, or templateJson is required' })
      }
    }

    const pdfBuffer = await generatePdfBuffer(templateJson, input.inputs)

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
    console.error('templating.generate failed', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Document Templates',
  summary: 'Generate PDF from template',
  methods: {
    POST: {
      summary: 'Generate PDF from document template',
      requestBody: { contentType: 'application/json', schema: documentTemplateGenerateSchema },
      responses: [
        { status: 200, description: 'PDF binary', mediaType: 'application/pdf' },
        { status: 404, description: 'Template not found' },
        { status: 400, description: 'Invalid request' },
      ],
    },
  },
}
