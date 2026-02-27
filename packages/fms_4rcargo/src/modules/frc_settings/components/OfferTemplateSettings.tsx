"use client"

import * as React from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { TemplateFormData } from './OfferTemplateEditor'
import { OfferTemplateEditorDialog, type EditorDialogState } from './OfferTemplateEditorDialog'
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

export function OfferTemplateSettings() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  
  const [templates, setTemplates] = React.useState<OfferTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [editorDialog, setEditorDialog] = React.useState<EditorDialogState>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<OfferTemplate | null>(null)
  const [previewTarget, setPreviewTarget] = React.useState<OfferTemplate | null>(null)
  const [previewHtml, setPreviewHtml] = React.useState('')
  const [previewSubject, setPreviewSubject] = React.useState('')

  const handlePreview = React.useCallback((template: OfferTemplate) => {
    const renderedSubject = renderTemplate(template.subjectTemplate, SAMPLE_TEMPLATE_DATA)
    const renderedContent = renderTemplate(template.contentTemplate, SAMPLE_TEMPLATE_DATA)
    const emailHtml = buildEmailHtml(renderedContent)
    setPreviewSubject(renderedSubject)
    setPreviewHtml(emailHtml)
    setPreviewTarget(template)
  }, [])

  const loadTemplates = React.useCallback(async () => {
    setLoading(true)
    try {
      const call = await apiCall<{ templates: OfferTemplate[] }>('/api/frc_settings/offer-templates')
      if (call.ok && call.result) {
        setTemplates(call.result.templates)
      } else {
        flash(t('frc_settings.offer_templates.errors.load', 'Failed to load templates'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.offer_templates.load failed', err)
      flash(t('frc_settings.offer_templates.errors.load', 'Failed to load templates'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t])

  React.useEffect(() => {
    void loadTemplates()
  }, [scopeVersion, loadTemplates])

  const handleCreate = React.useCallback(async (data: TemplateFormData) => {
    setSaving(true)
    try {
      const call = await apiCall<OfferTemplate>('/api/frc_settings/offer-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      
      if (call.ok && call.result) {
        flash(t('frc_settings.offer_templates.messages.created', 'Template created successfully'), 'success')
        setEditorDialog(null)
        void loadTemplates()
      } else {
        flash(t('frc_settings.offer_templates.errors.save', 'Failed to save template'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.offer_templates.create failed', err)
      flash(t('frc_settings.offer_templates.errors.save', 'Failed to save template'), 'error')
    } finally {
      setSaving(false)
    }
  }, [t, loadTemplates])

  const handleUpdate = React.useCallback(async (id: string, data: TemplateFormData) => {
    setSaving(true)
    try {
      const call = await apiCall<OfferTemplate>(`/api/frc_settings/offer-templates/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      
      if (call.ok && call.result) {
        flash(t('frc_settings.offer_templates.messages.updated', 'Template saved successfully'), 'success')
        setEditorDialog(null)
        void loadTemplates()
      } else {
        flash(t('frc_settings.offer_templates.errors.save', 'Failed to save template'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.offer_templates.update failed', err)
      flash(t('frc_settings.offer_templates.errors.save', 'Failed to save template'), 'error')
    } finally {
      setSaving(false)
    }
  }, [t, loadTemplates])

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return
    try {
      const call = await apiCall<{ ok: boolean }>(`/api/frc_settings/offer-templates/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      
      if (call.ok) {
        flash(t('frc_settings.offer_templates.messages.deleted', 'Template deleted'), 'success')
        setDeleteTarget(null)
        void loadTemplates()
      } else {
        flash(t('frc_settings.offer_templates.errors.delete', 'Failed to delete template'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.offer_templates.delete failed', err)
      flash(t('frc_settings.offer_templates.errors.delete', 'Failed to delete template'), 'error')
    }
  }, [t, loadTemplates, deleteTarget])

  const handleSetDefault = React.useCallback(async (template: OfferTemplate) => {
    try {
      const call = await apiCall<OfferTemplate>(`/api/frc_settings/offer-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      
      if (call.ok) {
        flash(t('frc_settings.offer_templates.messages.set_default', 'Template set as default'), 'success')
        void loadTemplates()
      } else {
        flash(t('frc_settings.offer_templates.errors.save', 'Failed to update template'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.offer_templates.setDefault failed', err)
      flash(t('frc_settings.offer_templates.errors.save', 'Failed to update template'), 'error')
    }
  }, [t, loadTemplates])

  const handleDuplicate = React.useCallback(async (template: OfferTemplate) => {
    setSaving(true)
    try {
      const call = await apiCall<OfferTemplate>('/api/frc_settings/offer-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          description: template.description,
          subjectTemplate: template.subjectTemplate,
          contentTemplate: template.contentTemplate,
          isDefault: false,
          isActive: template.isActive,
        }),
      })
      
      if (call.ok && call.result) {
        flash(t('frc_settings.offer_templates.messages.duplicated', 'Template duplicated'), 'success')
        void loadTemplates()
      } else {
        flash(t('frc_settings.offer_templates.errors.save', 'Failed to duplicate template'), 'error')
      }
    } catch (err) {
      console.error('frc_settings.offer_templates.duplicate failed', err)
      flash(t('frc_settings.offer_templates.errors.save', 'Failed to duplicate template'), 'error')
    } finally {
      setSaving(false)
    }
  }, [t, loadTemplates])  

  const handleEditorSave = React.useCallback(async (
    mode: 'create' | 'edit',
    templateId: string | null,
    data: TemplateFormData
  ) => {
    if (mode === 'create') {
      await handleCreate(data)
    } else if (templateId) {
      await handleUpdate(templateId, data)
    }
  }, [handleCreate, handleUpdate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold">
            {t('frc_settings.offer_templates.title', 'Offer Templates')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('frc_settings.offer_templates.description', 'Create and manage email templates for sending offers to customers')}
          </p>
        </div>
        <Button onClick={() => setEditorDialog({ mode: 'create' })}>
          {t('frc_settings.offer_templates.actions.create', 'Create Template')}
        </Button>
      </div>

      <div className="p-6">
        {templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t('frc_settings.offer_templates.empty', 'No offer templates yet')}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('frc_settings.offer_templates.empty_description', 'Create your first offer template to get started')}
            </p>
            <Button className="mt-4" onClick={() => setEditorDialog({ mode: 'create' })}>
              {t('frc_settings.offer_templates.actions.create', 'Create Template')}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    {t('frc_settings.offer_templates.table.name', 'Name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    {t('frc_settings.offer_templates.table.description', 'Description')}
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                    {t('frc_settings.offer_templates.table.is_default', 'Default')}
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                    {t('frc_settings.offer_templates.table.is_active', 'Active')}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                    {t('frc_settings.offer_templates.table.actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <span className="font-medium">{template.name}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {template.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {template.isDefault && (
                        <Badge variant="secondary">Default</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={template.isActive ? 'default' : 'outline'}>
                        {template.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreview(template)}
                          title={t('frc_settings.offer_templates.actions.preview', 'Preview')}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <RowActions
                          items={[
                            {
                              id: 'edit',
                              label: t('frc_settings.offer_templates.actions.edit', 'Edit'),
                              onSelect: () => setEditorDialog({ mode: 'edit', template }),
                            },
                            {
                              id: 'duplicate',
                              label: t('frc_settings.offer_templates.actions.duplicate', 'Duplicate'),
                              onSelect: () => handleDuplicate(template),
                            },
                            ...(!template.isDefault
                              ? [
                                  {
                                    id: 'set_default',
                                    label: t('frc_settings.offer_templates.actions.set_default', 'Set as Default'),
                                    onSelect: () => handleSetDefault(template),
                                  },
                                ]
                              : []),
                            {
                              id: 'delete',
                              label: t('frc_settings.offer_templates.actions.delete', 'Delete'),
                              destructive: true,
                              onSelect: () => setDeleteTarget(template),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <OfferTemplateEditorDialog
        state={editorDialog}
        onClose={() => setEditorDialog(null)}
        onSave={handleEditorSave}
        saving={saving}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('frc_settings.offer_templates.confirm_delete.title', 'Delete Template')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'frc_settings.offer_templates.confirm_delete.message',
                'Are you sure you want to delete this template? This action cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewTarget !== null} onOpenChange={(open: boolean) => !open && setPreviewTarget(null)}>
        <DialogContent
          className="overflow-hidden flex flex-col"
          style={{ maxWidth: '95vw', width: '800px', maxHeight: '90vh', height: '90vh' }}
        >
          <DialogHeader>
            <DialogTitle>
              {t('frc_settings.offer_templates.preview.title', 'Email Preview')}
              {previewTarget && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  — {previewTarget.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </section>
  )
}
