"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { PdfmeTemplateJson } from '../../data/entities'
import type { OfferTemplateVariable } from '../../lib/default-pdfme-templates'
import { PdfmeDesigner } from '../../components/PdfmeDesigner'

interface PdfDesignerClientProps {
  templateType: string
  templateId?: string
  templateName: string
  templateDescription?: string | null
  initialTemplate: PdfmeTemplateJson
  variables?: readonly OfferTemplateVariable[]
  isDefault: boolean
}

export function PdfDesignerClient({
  templateType,
  templateId,
  templateName: initialName,
  templateDescription: initialDescription,
  initialTemplate,
  variables,
  isDefault,
}: PdfDesignerClientProps) {
  const t = useT()
  const router = useRouter()

  const [templateName, setTemplateName] = React.useState(initialName)
  const [templateDescription, setTemplateDescription] = React.useState(initialDescription || '')
  const [showMetadataDialog, setShowMetadataDialog] = React.useState(false)
  const [pendingTemplate, setPendingTemplate] = React.useState<PdfmeTemplateJson | null>(null)

  // Handle save - show metadata dialog if new template
  const handleSaveRequest = async (template: PdfmeTemplateJson) => {
    if (isDefault || !templateId) {
      // New template - need to collect name/description
      setPendingTemplate(template)
      setShowMetadataDialog(true)
    } else {
      // Existing template - save directly
      await saveTemplate(template, templateName, templateDescription)
    }
  }

  // Actually save the template
  const saveTemplate = async (
    template: PdfmeTemplateJson,
    name: string,
    description: string
  ) => {
    try {
      const response = await fetch('/api/pdf_templates/pdfme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType,
          name,
          description: description || null,
          templateJson: template,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Save failed' }))
        throw new Error(error.error || 'Failed to save template')
      }

      const result = await response.json()

      // Update local state if we got new data
      if (result.name) {
        setTemplateName(result.name)
      }

      flash(t('pdf_templates.messages.template_saved', 'Template saved successfully'), 'success')

      // Refresh if this was a new template
      if (isDefault) {
        router.refresh()
      }
    } catch (error) {
      console.error('Failed to save template:', error)
      throw error // Re-throw so PdfmeDesigner shows error
    }
  }

  // Handle metadata dialog save
  const handleMetadataSave = async () => {
    if (!pendingTemplate) return

    if (!templateName.trim()) {
      flash(t('pdf_templates.errors.name_required', 'Template name is required'), 'error')
      return
    }

    try {
      await saveTemplate(pendingTemplate, templateName, templateDescription)
      setShowMetadataDialog(false)
      setPendingTemplate(null)
    } catch (error) {
      // Error already handled by saveTemplate
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b bg-background">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/backend/config/templates')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('common.back', 'Back')}
        </Button>

        <div className="flex-1">
          <h1 className="text-lg font-semibold">
            {templateName}
            {isDefault && (
              <span className="ml-2 text-xs font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded">
                {t('pdf_templates.designer.default_template', 'Default Template')}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {templateDescription || t('pdf_templates.designer.no_description', 'No description')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMetadataDialog(true)}
        >
          {t('pdf_templates.designer.edit_details', 'Edit Details')}
        </Button>
      </div>

      {/* Designer */}
      <div className="flex-1 min-h-0">
        <PdfmeDesigner
          initialTemplate={initialTemplate}
          templateType={templateType}
          variables={variables}
          onSave={handleSaveRequest}
        />
      </div>

      {/* Metadata Dialog */}
      <Dialog open={showMetadataDialog} onOpenChange={setShowMetadataDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isDefault || !templateId
                ? t('pdf_templates.designer.save_new_template', 'Save New Template')
                : t('pdf_templates.designer.edit_template_details', 'Edit Template Details')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'pdf_templates.designer.template_details_description',
                'Provide a name and optional description for your template.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="templateName">
                {t('pdf_templates.designer.template_name', 'Template Name')} *
              </Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t('pdf_templates.designer.template_name_placeholder', 'e.g., Standard Offer Template')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="templateDescription">
                {t('pdf_templates.designer.template_description', 'Description')}
              </Label>
              <Textarea
                id="templateDescription"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder={t(
                  'pdf_templates.designer.template_description_placeholder',
                  'Optional description of when to use this template...'
                )}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMetadataDialog(false)
                setPendingTemplate(null)
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleMetadataSave}>
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
