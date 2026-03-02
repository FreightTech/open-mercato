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
import { OfferTemplateEditor, type TemplateFormData } from './OfferTemplateEditor'
import { SAMPLE_TEMPLATE_DATA } from '../lib/offer-template-fields'
import { renderTemplate, buildEmailHtml } from '../lib/template-renderer'

type OfferTemplate = {
  id: string
  name: string
  description: string | null
  subjectTemplate: string
  contentTemplate: string
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type EditorDialogState =
  | { mode: 'create' }
  | { mode: 'edit'; template: OfferTemplate }
  | null

type Props = {
  state: EditorDialogState
  onClose: () => void
  onSave: (mode: 'create' | 'edit', templateId: string | null, data: TemplateFormData) => Promise<void>
  saving: boolean
}

export function OfferTemplateEditorDialog({ state, onClose, onSave, saving }: Props) {
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

  const getEditorInitialData = (template: OfferTemplate): Partial<TemplateFormData> => ({
    name: template.name,
    description: template.description ?? '',
    subjectTemplate: template.subjectTemplate,
    contentTemplate: template.contentTemplate,
    isDefault: template.isDefault,
    isActive: template.isActive,
  })

  const handlePreview = React.useCallback((html: string, subject: string) => {
    setPreviewHtml(html)
    setPreviewSubject(subject)
    setView('preview')
  }, [])

  const handleBackToEditor = React.useCallback(() => {
    setView('edit')
  }, [])

  const handleSave = React.useCallback(async (data: TemplateFormData) => {
    if (!state) return
    const templateId = state.mode === 'edit' ? state.template.id : null
    await onSave(state.mode, templateId, data)
  }, [state, onSave])

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
                  ? t('frc_settings.offer_templates.actions.create', 'Create Template')
                  : t('frc_settings.offer_templates.actions.edit', 'Edit Template')}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto p-1">
              <OfferTemplateEditor
                initialData={state?.mode === 'edit' ? getEditorInitialData(state.template) : undefined}
                onSave={handleSave}
                onCancel={onClose}
                onPreview={handlePreview}
                saving={saving}
              />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('frc_settings.offer_templates.preview.title', 'Email Preview')}
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
              {t('frc_settings.offer_templates.actions.back_to_editor', 'Back to Editor')}
            </Button>
            <div className="space-y-2">
              <div className="rounded-md border bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground mb-1">
                  {t('frc_settings.offer_templates.preview.subject', 'Subject:')}
                </p>
                <p className="text-sm font-medium">{previewSubject}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('frc_settings.offer_templates.preview.sample_data_notice', 'This preview uses sample data')}
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
