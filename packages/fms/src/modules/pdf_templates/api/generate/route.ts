import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { pdfPreviewSchema } from '../../data/validators'
import { previewTemplate } from '../../lib/template-renderer'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['pdf_templates.view'] },
}

/**
 * POST /api/pdf_templates/generate
 * Generate a PDF file from template and return as downloadable binary
 */
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

    // Generate HTML first using previewTemplate
    const html = await previewTemplate({
      templateType: input.templateType,
      htmlTemplate: input.htmlTemplate,
      cssStyles: input.cssStyles || '',
      variables: input.variables || {},
      settings: input.settings ? {
        companyName: input.settings.companyName || undefined,
        companyLogoUrl: input.settings.companyLogoUrl || undefined,
        primaryColor: input.settings.primaryColor,
        accentColor: input.settings.accentColor,
      } : undefined,
    })

    // Generate PDF using Puppeteer
    const puppeteer = await import('puppeteer')
    
    const pdfBuffer = await Promise.race([
      (async () => {
        const browser = await puppeteer.default.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        })

        try {
          const page = await browser.newPage()
          await page.setContent(html, { waitUntil: 'networkidle0' })
          
          const pdf = await page.pdf({
            format: 'A4',
            landscape: false,
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          })
          
          return Buffer.from(pdf)
        } finally {
          await browser.close()
        }
      })(),
      // Timeout after 60 seconds
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timeout')), 60000)
      ),
    ])

    // Generate filename: offer-{offerNumber}-{timestamp}.pdf
    const offerNumber = input.variables?.offerNumber || 'document'
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').slice(0, -5)
    const filename = `offer-${offerNumber}-${timestamp}.pdf`

    // Return PDF with download headers
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      console.error('PDF generate Zod validation failed:', JSON.stringify(err.issues, null, 2))
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: err.issues,
        },
        { status: 400 }
      )
    }

    const { translate } = await resolveTranslations()
    console.error('pdf_templates.generate failed', err)

    // Check for timeout
    if (err instanceof Error && err.message.includes('timeout')) {
      return NextResponse.json(
        { error: translate('pdf_templates.errors.generate_timeout', 'PDF generation timed out. Please try again.') },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: translate('pdf_templates.errors.generate_failed', 'Failed to generate PDF') },
      { status: 500 }
    )
  }
}

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'PDF Templates',
  summary: 'Generate PDF file',
  methods: {
    POST: {
      summary: 'Generate PDF from template and return binary file',
      requestBody: {
        contentType: 'application/json',
        schema: pdfPreviewSchema,
      },
      responses: [
        { status: 200, description: 'PDF binary file (application/pdf)' },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
        { status: 500, description: 'Generation failed', schema: errorSchema },
        { status: 504, description: 'Generation timeout', schema: errorSchema },
      ],
    },
  },
}
