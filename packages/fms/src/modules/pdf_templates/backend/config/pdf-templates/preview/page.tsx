import { redirect } from 'next/navigation'
import { PdfPreviewPage } from '../../../../components/PdfPreviewPage'
import { previewTemplate } from '../../../../lib/template-renderer'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['pdf_templates.view'],
}

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function PdfPreviewRoute({ searchParams }: PageProps) {
  // Get preview data from URL params
  const previewDataJson = searchParams.data as string | undefined

  if (!previewDataJson) {
    // No preview data, redirect back to settings
    redirect('/backend/config/pdf-templates')
    return null
  }

  try {
    // Decode preview data
    const previewData = JSON.parse(decodeURIComponent(previewDataJson))

    // Generate HTML preview
    const html = await previewTemplate({
      templateType: previewData.templateType,
      htmlTemplate: previewData.htmlTemplate,
      cssStyles: previewData.cssStyles || '',
      variables: previewData.variables || {},
      settings: previewData.settings ? {
        companyName: previewData.settings.companyName || undefined,
        companyLogoUrl: previewData.settings.companyLogoUrl || undefined,
        primaryColor: previewData.settings.primaryColor,
        accentColor: previewData.settings.accentColor,
      } : undefined,
    })

    return <PdfPreviewPage previewHtml={html} previewData={null} />
  } catch (error) {
    console.error('Failed to generate preview:', error)
    redirect('/backend/config/pdf-templates')
    return null
  }
}
