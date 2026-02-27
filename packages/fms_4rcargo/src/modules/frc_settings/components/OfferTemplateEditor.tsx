"use client"

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { OfferTemplateFieldPicker } from './OfferTemplateFieldPicker'
import { SAMPLE_TEMPLATE_DATA } from '../lib/offer-template-fields'
import { renderTemplate, buildEmailHtml } from '../lib/template-renderer'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

export type TemplateFormData = {
  name: string
  description: string
  subjectTemplate: string
  contentTemplate: string
  isDefault: boolean
  isActive: boolean
}

type Props = {
  initialData?: Partial<TemplateFormData>
  onSave: (data: TemplateFormData) => Promise<void>
  onCancel: () => void
  onPreview: (html: string, subject: string) => void
  saving?: boolean
}

export function OfferTemplateEditor({ initialData, onSave, onCancel, onPreview, saving }: Props) {
  const t = useT()
  const editorRef = React.useRef<{ textarea?: HTMLTextAreaElement | null }>(null)
  
  const [formData, setFormData] = React.useState<TemplateFormData>({
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    subjectTemplate: initialData?.subjectTemplate ?? '',
    contentTemplate: initialData?.contentTemplate ?? '',
    isDefault: initialData?.isDefault ?? false,
    isActive: initialData?.isActive ?? true,
  })

  const handleInsertTag = React.useCallback((tag: string) => {
    setFormData((prev) => ({
      ...prev,
      contentTemplate: prev.contentTemplate + tag,
    }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave(formData)
  }

  const handlePreview = React.useCallback(() => {
    const renderedSubject = renderTemplate(formData.subjectTemplate, SAMPLE_TEMPLATE_DATA)
    const renderedContent = renderTemplate(formData.contentTemplate, SAMPLE_TEMPLATE_DATA)
    const emailHtml = buildEmailHtml(renderedContent)
    onPreview(emailHtml, renderedSubject)
  }, [formData.subjectTemplate, formData.contentTemplate, onPreview])

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">
              {t('frc_settings.offer_templates.form.name', 'Template Name')}
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('frc_settings.offer_templates.form.name_placeholder', 'e.g., Standard Air Freight Offer')}
              required
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">
              {t('frc_settings.offer_templates.form.description', 'Description')}
            </Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t('frc_settings.offer_templates.form.description_placeholder', 'Brief description of when to use this template')}
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">
            {t('frc_settings.offer_templates.form.subject', 'Email Subject')}
          </Label>
          <Input
            id="subject"
            value={formData.subjectTemplate}
            onChange={(e) => setFormData((prev) => ({ ...prev, subjectTemplate: e.target.value }))}
            placeholder={t('frc_settings.offer_templates.form.subject_placeholder', 'e.g., Air Freight Offer {{offerNumber}} - {{clientName}}')}
            required
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            Use {'{{fieldName}}'} for dynamic values
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="space-y-2">
            <Label htmlFor="content">
              {t('frc_settings.offer_templates.form.content', 'Email Content')}
            </Label>
            <div data-color-mode="light">
              <MDEditor
                value={formData.contentTemplate}
                onChange={(val) => setFormData((prev) => ({ ...prev, contentTemplate: val ?? '' }))}
                height={350}
                preview="edit"
                hideToolbar={false}
                overflow={false}
                ref={editorRef as React.Ref<typeof MDEditor>}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('frc_settings.offer_templates.form.content_hint', 'Click a field from the panel to insert it. Use markdown for formatting.')}
            </p>
          </div>

          <div className="lg:border-l lg:pl-4">
            <OfferTemplateFieldPicker
              onInsertTag={handleInsertTag}
              disabled={saving}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isDefault}
              onChange={(e) => setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))}
              disabled={saving}
              className="rounded border-gray-300"
            />
            <span className="text-sm">Set as default template</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
              disabled={saving}
              className="rounded border-gray-300"
            />
            <span className="text-sm">Active</span>
          </label>
        </div>

        <div className="flex justify-between gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handlePreview}
            disabled={saving || !formData.contentTemplate}
          >
            {t('frc_settings.offer_templates.actions.preview', 'Preview')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              {t('frc_settings.offer_templates.actions.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? t('frc_settings.offer_templates.actions.saving', 'Saving...')
                : t('frc_settings.offer_templates.actions.save', 'Save Template')}
            </Button>
          </div>
        </div>
    </form>
  )
}
