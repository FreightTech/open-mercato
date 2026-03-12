"use client"

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { EmailTemplateEditor, type TemplateFormData } from './EmailTemplateEditor'
import type { TemplateType } from '../lib/template-fields'

type EmailTemplate = {
  templateType: TemplateType
  subjectTemplate: string
  htmlTemplate: string
  isActive: boolean
}

export type EditorDialogState =
  | { mode: 'create' }
  | { mode: 'edit'; template: EmailTemplate }
  | null

type Props = {
  state: EditorDialogState
  onClose: () => void
  onSave: (mode: 'create' | 'edit', templateType: TemplateType, data: TemplateFormData) => Promise<void>
  saving: boolean
  settings?: {
    companyName?: string | null
    companyLogoUrl?: string | null
    primaryColor?: string
    accentColor?: string
    contactEmail?: string | null
    contactPhone?: string | null
    websiteUrl?: string | null
    footerText?: string | null
    footerDisclaimer?: string | null
  }
}

export function EmailTemplateEditorDialog({ state, onClose, onSave, saving, settings }: Props) {
  const t = useT()
  const [view, setView] = React.useState<'edit' | 'preview'>('edit')
  const [previewHtml, setPreviewHtml] = React.useState('')
  const [previewSubject, setPreviewSubject] = React.useState('')

  // Reset view to 'edit' when dialog opens with new state
  React.useEffect(() => {
    if (state !== null) {
      setView('edit')
      setPreviewHtml('')
      setPreviewSubject('')
    }
  }, [state])

  const getEditorInitialData = (template: EmailTemplate): Partial<TemplateFormData> => ({
    templateType: template.templateType,
    subjectTemplate: template.subjectTemplate,
    contentTemplate: template.htmlTemplate,
  })

  const handlePreview = React.useCallback((html: string, subject: string) => {
    setPreviewHtml(html)
    setPreviewSubject(subject)
    setView('preview')
  }, [])

  const handleBackToEditor = React.useCallback(() => {
    setView('edit')
  }, [])

  const handleSave = React.useCallback(
    async (data: TemplateFormData) => {
      if (!state) return
      await onSave(state.mode, data.templateType, data)
    },
    [state, onSave]
  )

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="overflow-hidden flex flex-col"
        style={{ maxWidth: '95vw', width: '1000px', maxHeight: '95vh' }}
      >
        {view === 'edit' ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {state?.mode === 'create'
                  ? t('email_templates.dialog.create_title', 'Create Template')
                  : t('email_templates.dialog.edit_title', 'Edit Template')}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto p-1">
              <EmailTemplateEditor
                initialData={state?.mode === 'edit' ? getEditorInitialData(state.template) : undefined}
                onSave={handleSave}
                onCancel={onClose}
                onPreview={handlePreview}
                saving={saving}
                isEditing={state?.mode === 'edit'}
                settings={settings}
              />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('email_templates.preview.title', 'Email Preview')}
              </DialogTitle>
            </DialogHeader>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={handleBackToEditor}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('email_templates.preview.back_to_editor', 'Back to Editor')}
            </Button>
            <div className="space-y-2">
              <div className="rounded-md border bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground mb-1">
                  {t('email_templates.preview.subject_label', 'Subject:')}
                </p>
                <p className="text-sm font-medium">{previewSubject}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('email_templates.preview.sample_data_notice', 'This preview uses sample data')}
              </p>
            </div>
            <div className="flex-1 overflow-auto border rounded-md bg-gray-100 p-2">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full min-h-[500px] bg-white border-0 rounded"
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
