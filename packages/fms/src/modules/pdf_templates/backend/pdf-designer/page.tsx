import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import type { PdfmeTemplateJson } from '../../data/entities'
import { OFFER_TEMPLATE_VARIABLES, getDefaultPdfmeTemplate } from '../../lib/default-pdfme-templates'
import { PdfDesignerClient } from '../../components/PdfDesignerClient'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['pdf_templates.manage'],
}

type TemplateResponse = {
  id?: string
  templateType: string
  name: string | null
  description?: string | null
  templateJson: PdfmeTemplateJson | null
  isActive: boolean
  isDefault: boolean
  variables?: typeof OFFER_TEMPLATE_VARIABLES
}

async function loadTemplate(templateType: string): Promise<TemplateResponse> {
  const cookieStore = await cookies()
  const headersList = await headers()

  // Build absolute URL for server-side fetch
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const url = `${protocol}://${host}/api/pdf_templates/pdfme?type=${encodeURIComponent(templateType)}&includeDefault=true&includeVariables=true`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': cookieStore.toString(),
      'x-brand-id': headersList.get('x-brand-id') || '',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Failed to load template: ${errorText}`)
  }

  return response.json()
}

async function PdfDesignerContent({ templateType }: { templateType: string }) {
  const { translate } = await resolveTranslations()

  try {
    const templateData = await loadTemplate(templateType)

    // Use the template JSON from API or fallback to default
    const initialTemplate = templateData.templateJson || getDefaultPdfmeTemplate(templateType)
    const templateName = templateData.name || `${templateType.charAt(0).toUpperCase() + templateType.slice(1)} Template`

    return (
      <PdfDesignerClient
        templateType={templateType}
        templateId={templateData.id}
        templateName={templateName}
        templateDescription={templateData.description}
        initialTemplate={initialTemplate}
        variables={OFFER_TEMPLATE_VARIABLES}
        isDefault={templateData.isDefault}
      />
    )
  } catch (error) {
    console.error('Failed to load template:', error)
    return (
      <ErrorMessage
        label={translate('pdf_templates.errors.load_failed', 'Failed to load template')}
        description={error instanceof Error ? error.message : 'Unknown error'}
      />
    )
  }
}

export default async function PdfDesignerPage({
  searchParams,
}: {
  searchParams?: { type?: string }
}) {
  const templateType = searchParams?.type || 'offer'

  // Validate template type
  const validTypes = ['offer']
  if (!validTypes.includes(templateType)) {
    redirect(`/backend/pdf-designer?type=offer`)
  }

  return (
    <div className="h-screen flex flex-col">
      <Suspense fallback={<LoadingMessage label="Loading template..." />}>
        <PdfDesignerContent templateType={templateType} />
      </Suspense>
    </div>
  )
}
