'use client'

import { Button } from '@open-mercato/ui/primitives/button'
import { ArrowLeft } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'

interface PdfPreviewPageProps {
  previewHtml: string
  previewData: any
}

export function PdfPreviewPage({ previewHtml }: PdfPreviewPageProps) {
  const t = useT()

  const handleBack = () => {
    window.close()
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Fixed Toolbar */}
      <div className="sticky top-0 z-50 bg-background border-b px-6 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('pdf_templates.preview.back', 'Back to Settings')}
        </Button>
        <h1 className="text-xl font-semibold">
          {t('pdf_templates.preview.title', 'PDF Preview')}
        </h1>
      </div>

      {/* Scrollable Preview Area */}
      <div className="flex-1 overflow-auto bg-gray-100 p-8">
        <div className="max-w-[210mm] mx-auto shadow-2xl">
          <iframe
            srcDoc={previewHtml}
            className="w-full min-h-[297mm] border-0 bg-white"
            style={{ backgroundColor: 'white' }}
            title="PDF Preview"
          />
        </div>
      </div>
    </div>
  )
}
