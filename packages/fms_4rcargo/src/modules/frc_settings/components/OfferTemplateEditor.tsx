"use client"

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Label } from '@open-mercato/ui/primitives/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { OfferTemplateFieldPicker } from './OfferTemplateFieldPicker'
import { SAMPLE_TEMPLATE_DATA } from '../lib/offer-template-fields'
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
  saving?: boolean
}

export function OfferTemplateEditor({ initialData, onSave, onCancel, saving }: Props) {
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
  
  const [showPreview, setShowPreview] = React.useState(false)
  const [previewHtml, setPreviewHtml] = React.useState('')

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

  const renderTemplate = React.useCallback((template: string, variables: Record<string, unknown>): string => {
    let rendered = template

    // Handle {{#each array}}...{{/each}} loops
    rendered = rendered.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
      const array = variables[key]
      if (!Array.isArray(array) || array.length === 0) {
        return ''
      }
      
      return array.map((item, index) => {
        let itemContent = content
        itemContent = itemContent.replace(/\{\{this\}\}/g, String(item))
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index))
        
        if (typeof item === 'object' && item !== null) {
          itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (m: string, prop: string) => {
            const val = (item as Record<string, unknown>)[prop]
            return val !== undefined && val !== null ? String(val) : m
          })
        }
        
        return itemContent
      }).join('')
    })

    // Handle {{#if variable}}...{{/if}} conditionals
    rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
      const value = variables[key]
      if (value && value !== '' && value !== 'false' && value !== '0') {
        return content
      }
      return ''
    })

    // Handle {{variable}} replacements
    rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key]
      return value !== undefined && value !== null ? String(value) : match
    })

    return rendered
  }, [])

  const buildEmailHtml = React.useCallback((content: string): string => {
    // Convert markdown to basic HTML (simplified)
    let html = content
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #333;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #9565f5 0%, #7c3aed 100%);
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px 20px;
    }
    .content h1, .content h2, .content h3 {
      color: #1a1a1a;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    .content h1 { font-size: 20px; }
    .content h2 { font-size: 18px; }
    .content h3 { font-size: 16px; }
    .footer {
      background-color: #f7fafc;
      color: #718096;
      font-size: 12px;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      border-radius: 0 0 8px 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background-color: #f7fafc;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>4R Cargo</h1>
    </div>
    <div class="content">
      ${html}
    </div>
    <div class="footer">
      <p>4R Cargo - Air Freight Solutions</p>
      <p>This email was generated from a template</p>
    </div>
  </div>
</body>
</html>
`.trim()
  }, [])

  const handlePreview = React.useCallback(() => {
    const renderedContent = renderTemplate(formData.contentTemplate, SAMPLE_TEMPLATE_DATA)
    const emailHtml = buildEmailHtml(renderedContent)
    setPreviewHtml(emailHtml)
    setShowPreview(true)
  }, [formData.contentTemplate, renderTemplate, buildEmailHtml])

  return (
    <>
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

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent
          className="overflow-hidden flex flex-col"
          style={{ maxWidth: '95vw', width: '800px', maxHeight: '90vh', height: '90vh' }}
        >
          <DialogHeader>
            <DialogTitle>
              {t('frc_settings.offer_templates.preview.title', 'Email Preview')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('frc_settings.offer_templates.preview.sample_data_notice', 'This preview uses sample data')}
          </p>
          <div className="flex-1 overflow-auto border rounded-md bg-gray-100 p-2">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full min-h-[500px] bg-white border-0 rounded"
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
