"use client"

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TemplateFieldPicker } from './TemplateFieldPicker'
import {
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_LABELS,
  SAMPLE_TEMPLATE_DATA,
  DEFAULT_TEMPLATE_CONTENT,
  type TemplateType,
} from '../lib/template-fields'
import { renderTemplate, buildEmailHtml } from '../lib/template-renderer.client'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

export type TemplateFormData = {
  templateType: TemplateType
  subjectTemplate: string
  contentTemplate: string
}

type Props = {
  initialData?: Partial<TemplateFormData>
  onSave: (data: TemplateFormData) => Promise<void>
  onCancel: () => void
  onPreview: (html: string, subject: string) => void
  saving?: boolean
  isEditing?: boolean
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

export function EmailTemplateEditor({
  initialData,
  onSave,
  onCancel,
  onPreview,
  saving,
  isEditing,
  settings,
}: Props) {
  const t = useT()

  const [formData, setFormData] = React.useState<TemplateFormData>({
    templateType: initialData?.templateType ?? 'offer',
    subjectTemplate: initialData?.subjectTemplate ?? '',
    contentTemplate: initialData?.contentTemplate ?? '',
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
    const sampleData = SAMPLE_TEMPLATE_DATA[formData.templateType]
    const mergedVariables = {
      ...sampleData,
      companyName: settings?.companyName || sampleData.companyName,
      primaryColor: settings?.primaryColor || sampleData.primaryColor,
      accentColor: settings?.accentColor || sampleData.accentColor,
    }

    const renderedSubject = renderTemplate(formData.subjectTemplate, mergedVariables)
    const emailHtml = buildEmailHtml(formData.contentTemplate, mergedVariables, {
      companyName: settings?.companyName,
      companyLogoUrl: settings?.companyLogoUrl,
      primaryColor: settings?.primaryColor,
      accentColor: settings?.accentColor,
      contactEmail: settings?.contactEmail,
      contactPhone: settings?.contactPhone,
      websiteUrl: settings?.websiteUrl,
      footerText: settings?.footerText,
      footerDisclaimer: settings?.footerDisclaimer,
    })
    onPreview(emailHtml, renderedSubject)
  }, [formData, settings, onPreview])

  const handlePasteDefault = React.useCallback(() => {
    const defaultContent = DEFAULT_TEMPLATE_CONTENT[formData.templateType]
    setFormData((prev) => ({
      ...prev,
      subjectTemplate: defaultContent.subject,
      contentTemplate: defaultContent.content,
    }))
  }, [formData.templateType])

  const handleTemplateTypeChange = React.useCallback((value: string) => {
    const newType = value as TemplateType
    setFormData((prev) => ({
      ...prev,
      templateType: newType,
      // Reset content when changing type (only if not editing)
      ...(isEditing
        ? {}
        : {
            subjectTemplate: DEFAULT_TEMPLATE_CONTENT[newType].subject,
            contentTemplate: DEFAULT_TEMPLATE_CONTENT[newType].content,
          }),
    }))
  }, [isEditing])

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="templateType">
          {t('email_templates.editor.template_type', 'Template Type')}
        </Label>
        <select
          id="templateType"
          value={formData.templateType}
          onChange={(e) => handleTemplateTypeChange(e.target.value)}
          disabled={saving || isEditing}
          className="flex h-10 w-full md:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {TEMPLATE_TYPES.map((type) => (
            <option key={type} value={type}>
              {TEMPLATE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {isEditing && (
          <p className="text-xs text-muted-foreground">
            {t('email_templates.editor.type_locked', 'Template type cannot be changed when editing')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">
          {t('email_templates.editor.subject', 'Email Subject')}
        </Label>
        <Input
          id="subject"
          value={formData.subjectTemplate}
          onChange={(e) => setFormData((prev) => ({ ...prev, subjectTemplate: e.target.value }))}
          placeholder={t(
            'email_templates.editor.subject_placeholder',
            'e.g., Freight Offer {{offerNumber}} - {{originPorts}} to {{destPorts}}'
          )}
          required
          disabled={saving}
        />
        <p className="text-xs text-muted-foreground">
          {t('email_templates.editor.variables_hint', 'Use {{fieldName}} for dynamic values')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-2">
          <Label htmlFor="content">
            {t('email_templates.editor.content', 'Email Content')}
          </Label>
          <div data-color-mode="light">
            <MDEditor
              value={formData.contentTemplate}
              onChange={(val) => setFormData((prev) => ({ ...prev, contentTemplate: val ?? '' }))}
              height={350}
              preview="edit"
              hideToolbar={false}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'email_templates.editor.content_hint',
              'Click a field from the panel to insert it. Use markdown for formatting.'
            )}
          </p>
        </div>

        <div className="lg:border-l lg:pl-4">
          <TemplateFieldPicker
            templateType={formData.templateType}
            onInsertTag={handleInsertTag}
            disabled={saving}
          />
        </div>
      </div>

      <div className="flex justify-between gap-2 pt-4 border-t">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handlePasteDefault}
            disabled={saving}
          >
            {t('email_templates.editor.paste_default', 'Paste Default')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePreview}
            disabled={saving || !formData.contentTemplate}
          >
            {t('email_templates.editor.preview', 'Preview')}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? t('common.saving', 'Saving...')
              : t('common.save', 'Save')}
          </Button>
        </div>
      </div>
    </form>
  )
}
