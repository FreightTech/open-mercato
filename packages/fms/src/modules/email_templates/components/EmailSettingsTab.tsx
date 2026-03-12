"use client"

import * as React from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { EmailTemplateEditorDialog, type EditorDialogState } from './EmailTemplateEditorDialog'
import type { TemplateFormData } from './EmailTemplateEditor'
import {
  type TemplateType,
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_LABELS,
  SAMPLE_TEMPLATE_DATA,
} from '../lib/template-fields'
import { renderTemplate, buildEmailHtml } from '../lib/template-renderer.client'
import type { EmailSpecificSettings, SharedBrandSettings } from '../lib/shared-brand-settings'

type EmailTemplate = {
  templateType: TemplateType
  subjectTemplate: string
  htmlTemplate: string
  isActive: boolean
}

type EmailSettingsTabProps = {
  settings: EmailSpecificSettings
  brandSettings: SharedBrandSettings
  templates: EmailTemplate[]
  saving: boolean
  onChange: (settings: EmailSpecificSettings) => void
  onSave: () => Promise<void>
  onTemplatesChange: () => Promise<void>
}

export function EmailSettingsTab({
  settings,
  brandSettings,
  templates,
  saving,
  onChange,
  onSave,
  onTemplatesChange,
}: EmailSettingsTabProps) {
  const t = useT()

  const [editorDialog, setEditorDialog] = React.useState<EditorDialogState>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<EmailTemplate | null>(null)
  const [previewTarget, setPreviewTarget] = React.useState<EmailTemplate | null>(null)
  const [previewHtml, setPreviewHtml] = React.useState('')
  const [previewSubject, setPreviewSubject] = React.useState('')

  const handleChange = React.useCallback(
    <K extends keyof EmailSpecificSettings>(field: K) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ ...settings, [field]: e.target.value || null })
      },
    [settings, onChange]
  )

  const handlePreview = React.useCallback(
    (template: EmailTemplate) => {
      const sampleData = SAMPLE_TEMPLATE_DATA[template.templateType]
      const variables = {
        ...sampleData,
        companyName: brandSettings.companyName || sampleData.companyName,
        primaryColor: brandSettings.primaryColor,
        accentColor: brandSettings.accentColor,
      }

      // Build settings object for buildEmailHtml
      const emailSettings = {
        companyName: brandSettings.companyName,
        companyLogoUrl: brandSettings.companyLogoUrl,
        primaryColor: brandSettings.primaryColor,
        accentColor: brandSettings.accentColor,
        contactEmail: settings.contactEmail,
        contactPhone: settings.contactPhone,
        websiteUrl: settings.websiteUrl,
        footerText: settings.footerText,
        footerDisclaimer: settings.footerDisclaimer,
        fromName: settings.fromName,
        fromEmail: settings.fromEmail,
        replyToEmail: settings.replyToEmail,
      }

      const renderedSubject = renderTemplate(template.subjectTemplate, variables)
      const renderedHtml = buildEmailHtml(template.htmlTemplate, variables, emailSettings)

      setPreviewSubject(renderedSubject)
      setPreviewHtml(renderedHtml)
      setPreviewTarget(template)
    },
    [settings, brandSettings]
  )

  const handleEditorSave = React.useCallback(
    async (mode: 'create' | 'edit', templateType: TemplateType, data: TemplateFormData) => {
      try {
        const call = await apiCall<EmailTemplate>('/api/email_templates/templates', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            templateType: data.templateType,
            subjectTemplate: data.subjectTemplate,
            htmlTemplate: data.contentTemplate,
            isActive: true,
          }),
        })

        if (call.ok && call.result) {
          flash(
            t('email_templates.messages.template_saved', 'Email template saved successfully'),
            'success'
          )
          setEditorDialog(null)
          await onTemplatesChange()
        } else {
          flash(t('email_templates.errors.save_template', 'Failed to save email template'), 'error')
        }
      } catch (err) {
        console.error('email_templates.template.save failed', err)
        flash(t('email_templates.errors.save_template', 'Failed to save email template'), 'error')
      }
    },
    [t, onTemplatesChange]
  )

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return
    try {
      const call = await apiCall<{ ok: boolean }>(
        `/api/email_templates/templates/${deleteTarget.templateType}`,
        { method: 'DELETE' }
      )

      if (call.ok) {
        flash(t('email_templates.messages.template_deleted', 'Template deleted'), 'success')
        setDeleteTarget(null)
        await onTemplatesChange()
      } else {
        flash(t('email_templates.errors.delete_template', 'Failed to delete template'), 'error')
      }
    } catch (err) {
      console.error('email_templates.template.delete failed', err)
      flash(t('email_templates.errors.delete_template', 'Failed to delete template'), 'error')
    }
  }, [t, onTemplatesChange, deleteTarget])

  const getTemplateForType = (type: TemplateType): EmailTemplate | null => {
    return templates.find((t) => t.templateType === type) ?? null
  }

  // Combined settings for editor dialog
  const combinedSettings = React.useMemo(
    () => ({
      companyName: brandSettings.companyName,
      companyLogoUrl: brandSettings.companyLogoUrl,
      primaryColor: brandSettings.primaryColor,
      accentColor: brandSettings.accentColor,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      websiteUrl: settings.websiteUrl,
      footerText: settings.footerText,
      footerDisclaimer: settings.footerDisclaimer,
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyToEmail: settings.replyToEmail,
    }),
    [settings, brandSettings]
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {t('templates.email.title', 'Email Templates')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'templates.email.description',
              'Configure email settings and manage notification templates'
            )}
          </p>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving && <Spinner className="mr-2 h-4 w-4" />}
          {t('templates.email.save', 'Save Email Settings')}
        </Button>
      </div>

      {/* Email-Specific Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('templates.email.settings', 'Email Settings')}</CardTitle>
          <CardDescription>
            {t(
              'templates.email.settings_description',
              'Configure contact information and sender defaults for emails'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">
              {t('email_templates.settings.contact_info', 'Contact Information')}
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">
                  {t('email_templates.settings.contact_email', 'Contact Email')}
                </Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={settings.contactEmail || ''}
                  onChange={handleChange('contactEmail')}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">
                  {t('email_templates.settings.contact_phone', 'Contact Phone')}
                </Label>
                <Input
                  id="contactPhone"
                  value={settings.contactPhone || ''}
                  onChange={handleChange('contactPhone')}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">
                  {t('email_templates.settings.website_url', 'Website URL')}
                </Label>
                <Input
                  id="websiteUrl"
                  type="url"
                  value={settings.websiteUrl || ''}
                  onChange={handleChange('websiteUrl')}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Sender Defaults */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">
              {t('email_templates.settings.sender_defaults', 'Sender Defaults')}
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fromName">
                  {t('email_templates.settings.from_name', 'From Name')}
                </Label>
                <Input
                  id="fromName"
                  value={settings.fromName || ''}
                  onChange={handleChange('fromName')}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fromEmail">
                  {t('email_templates.settings.from_email', 'From Email')}
                </Label>
                <Input
                  id="fromEmail"
                  type="email"
                  value={settings.fromEmail || ''}
                  onChange={handleChange('fromEmail')}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replyToEmail">
                  {t('email_templates.settings.reply_to', 'Reply-To Email')}
                </Label>
                <Input
                  id="replyToEmail"
                  type="email"
                  value={settings.replyToEmail || ''}
                  onChange={handleChange('replyToEmail')}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Footer Content */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">
              {t('email_templates.settings.footer_content', 'Footer Content')}
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="footerText">
                  {t('email_templates.settings.footer_text', 'Footer Text')}
                </Label>
                <Input
                  id="footerText"
                  value={settings.footerText || ''}
                  onChange={handleChange('footerText')}
                  disabled={saving}
                  placeholder={t(
                    'email_templates.settings.footer_text_placeholder',
                    'Company address or tagline'
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="footerDisclaimer">
                  {t('email_templates.settings.footer_disclaimer', 'Footer Disclaimer')}
                </Label>
                <Input
                  id="footerDisclaimer"
                  value={settings.footerDisclaimer || ''}
                  onChange={handleChange('footerDisclaimer')}
                  disabled={saving}
                  placeholder={t(
                    'email_templates.settings.footer_disclaimer_placeholder',
                    'Legal disclaimer text'
                  )}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('email_templates.templates.title', 'Email Templates')}</CardTitle>
              <CardDescription>
                {t(
                  'email_templates.templates.description',
                  'Manage email templates for different notification types'
                )}
              </CardDescription>
            </div>
            <Button onClick={() => setEditorDialog({ mode: 'create' })}>
              {t('email_templates.actions.create_template', 'Create Template')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    {t('email_templates.templates.table.type', 'Type')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    {t('email_templates.templates.table.subject', 'Subject')}
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                    {t('email_templates.templates.table.status', 'Status')}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                    {t('email_templates.templates.table.actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {TEMPLATE_TYPES.map((type) => {
                  const template = getTemplateForType(type)
                  const hasCustomTemplate = template !== null

                  return (
                    <tr key={type} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <span className="font-medium">
                          {t(`email_templates.types.${type}.label`, TEMPLATE_TYPE_LABELS[type])}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                        {template?.subjectTemplate || (
                          <span className="italic">
                            {t('email_templates.templates.using_default', 'Using default')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={hasCustomTemplate ? 'default' : 'outline'}>
                          {hasCustomTemplate
                            ? t('email_templates.templates.status.custom', 'Custom')
                            : t('email_templates.templates.status.default', 'Default')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {hasCustomTemplate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePreview(template)}
                              title={t('email_templates.actions.preview', 'Preview')}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <RowActions
                            items={[
                              {
                                id: 'edit',
                                label: hasCustomTemplate
                                  ? t('email_templates.actions.edit', 'Edit')
                                  : t('email_templates.actions.customize', 'Customize'),
                                onSelect: () =>
                                  setEditorDialog(
                                    hasCustomTemplate
                                      ? { mode: 'edit', template }
                                      : { mode: 'create' }
                                  ),
                              },
                              ...(hasCustomTemplate
                                ? [
                                    {
                                      id: 'delete',
                                      label: t('email_templates.actions.delete', 'Delete'),
                                      destructive: true,
                                      onSelect: () => setDeleteTarget(template),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <EmailTemplateEditorDialog
        state={editorDialog}
        onClose={() => setEditorDialog(null)}
        onSave={handleEditorSave}
        saving={saving}
        settings={combinedSettings}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('email_templates.confirm_delete.title', 'Delete Template')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'email_templates.confirm_delete.message',
                'Are you sure you want to delete this template? The system will revert to using the default template.'
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
      <Dialog
        open={previewTarget !== null}
        onOpenChange={(open: boolean) => !open && setPreviewTarget(null)}
      >
        <DialogContent
          className="overflow-hidden flex flex-col"
          style={{ maxWidth: '95vw', width: '800px', maxHeight: '90vh', height: '90vh' }}
        >
          <DialogHeader>
            <DialogTitle>
              {t('email_templates.preview.title', 'Email Preview')}
              {previewTarget && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  - {t(`email_templates.types.${previewTarget.templateType}.label`, TEMPLATE_TYPE_LABELS[previewTarget.templateType])}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
