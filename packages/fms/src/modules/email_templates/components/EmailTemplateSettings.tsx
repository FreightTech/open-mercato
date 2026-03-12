"use client"

import * as React from 'react'
import { Eye, Wand2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
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
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
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

type EmailSettings = {
  companyName?: string | null
  companyLogoUrl?: string | null
  primaryColor: string
  accentColor: string
  contactEmail?: string | null
  contactPhone?: string | null
  websiteUrl?: string | null
  footerText?: string | null
  footerDisclaimer?: string | null
  fromName?: string | null
  fromEmail?: string | null
  replyToEmail?: string | null
}

type BrandDefaults = {
  companyName?: string | null
  companyLogoUrl?: string | null
  primaryColor?: string
  accentColor?: string
}

type EmailSettingsResponse = EmailSettings & {
  brandDefaults?: BrandDefaults | null
}

type EmailTemplate = {
  templateType: TemplateType
  subjectTemplate: string
  htmlTemplate: string
  isActive: boolean
}

const DEFAULT_SETTINGS: EmailSettings = {
  companyName: '',
  companyLogoUrl: '',
  primaryColor: '#1a365d',
  accentColor: '#f7fafc',
  contactEmail: '',
  contactPhone: '',
  websiteUrl: '',
  footerText: '',
  footerDisclaimer: '',
  fromName: '',
  fromEmail: '',
  replyToEmail: '',
}

export function EmailTemplateSettings() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()

  const [settings, setSettings] = React.useState<EmailSettings>(DEFAULT_SETTINGS)
  const [brandDefaults, setBrandDefaults] = React.useState<BrandDefaults | null>(null)
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([])

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<'settings' | 'templates'>('settings')
  const [editorDialog, setEditorDialog] = React.useState<EditorDialogState>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<EmailTemplate | null>(null)
  const [previewTarget, setPreviewTarget] = React.useState<EmailTemplate | null>(null)
  const [previewHtml, setPreviewHtml] = React.useState('')
  const [previewSubject, setPreviewSubject] = React.useState('')

  const loadSettings = React.useCallback(async () => {
    try {
      const call = await apiCall<EmailSettingsResponse>('/api/email_templates/settings')
      if (call.ok && call.result) {
        const { brandDefaults: bd, ...settingsData } = call.result
        setBrandDefaults(bd ?? null)

        // Auto-populate empty fields from brand defaults on first load
        const hasExistingData =
          settingsData.companyName ||
          settingsData.companyLogoUrl ||
          (settingsData.primaryColor && settingsData.primaryColor !== '#1a365d') ||
          (settingsData.accentColor && settingsData.accentColor !== '#f7fafc')

        if (!hasExistingData && bd) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...settingsData,
            companyName: bd.companyName || settingsData.companyName || '',
            companyLogoUrl: bd.companyLogoUrl || settingsData.companyLogoUrl || '',
            primaryColor: bd.primaryColor || settingsData.primaryColor || '#1a365d',
            accentColor: bd.accentColor || settingsData.accentColor || '#f7fafc',
          })
        } else {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...settingsData,
          })
        }
      } else {
        flash(t('email_templates.errors.load_settings', 'Failed to load email settings'), 'error')
      }
    } catch (err) {
      console.error('email_templates.settings.load failed', err)
      flash(t('email_templates.errors.load_settings', 'Failed to load email settings'), 'error')
    }
  }, [t])

  const loadTemplates = React.useCallback(async () => {
    try {
      const call = await apiCall<{
        templates: Record<string, EmailTemplate>
        availableTypes: string[]
      }>('/api/email_templates/templates')

      if (call.ok && call.result) {
        // Convert record to array
        const templateList: EmailTemplate[] = Object.entries(call.result.templates).map(
          ([type, template]) => ({
            templateType: type as TemplateType,
            subjectTemplate: template.subjectTemplate,
            htmlTemplate: template.htmlTemplate,
            isActive: template.isActive,
          })
        )
        setTemplates(templateList)
      }
    } catch (err) {
      console.error('email_templates.templates.load failed', err)
      flash(t('email_templates.errors.load_templates', 'Failed to load email templates'), 'error')
    }
  }, [t])

  const loadAll = React.useCallback(async () => {
    setLoading(true)
    await Promise.all([loadSettings(), loadTemplates()])
    setLoading(false)
  }, [loadSettings, loadTemplates])

  React.useEffect(() => {
    void loadAll()
  }, [scopeVersion])

  const handleSettingsChange =
    <K extends keyof EmailSettings>(key: K) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSettings((prev) => ({ ...prev, [key]: event.target.value }))
    }

  const handleApplyBrandDefaults = React.useCallback(() => {
    if (!brandDefaults) return
    setSettings((prev) => ({
      ...prev,
      companyName: brandDefaults.companyName || prev.companyName,
      companyLogoUrl: brandDefaults.companyLogoUrl || prev.companyLogoUrl,
      primaryColor: brandDefaults.primaryColor || prev.primaryColor,
      accentColor: brandDefaults.accentColor || prev.accentColor,
    }))
    flash(t('email_templates.messages.brand_defaults_applied', 'Brand defaults applied'), 'info')
  }, [brandDefaults, t])

  const handleSaveSettings = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setSaving(true)
      try {
        const call = await apiCall<EmailSettings>('/api/email_templates/settings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(settings),
        })

        if (call.ok && call.result) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...call.result,
          })
          flash(
            t('email_templates.messages.settings_saved', 'Email settings saved successfully'),
            'success'
          )
        } else {
          flash(t('email_templates.errors.save_settings', 'Failed to save email settings'), 'error')
        }
      } catch (err) {
        console.error('email_templates.settings.save failed', err)
        flash(t('email_templates.errors.save_settings', 'Failed to save email settings'), 'error')
      } finally {
        setSaving(false)
      }
    },
    [settings, t]
  )

  const handlePreview = React.useCallback(
    (template: EmailTemplate) => {
      const sampleData = SAMPLE_TEMPLATE_DATA[template.templateType]
      const variables = {
        ...sampleData,
        companyName: settings.companyName || sampleData.companyName,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
      }

      const renderedSubject = renderTemplate(template.subjectTemplate, variables)
      const renderedHtml = buildEmailHtml(template.htmlTemplate, variables, settings)

      setPreviewSubject(renderedSubject)
      setPreviewHtml(renderedHtml)
      setPreviewTarget(template)
    },
    [settings]
  )

  const handleEditorSave = React.useCallback(
    async (mode: 'create' | 'edit', templateType: TemplateType, data: TemplateFormData) => {
      setSaving(true)
      try {
        const call = await apiCall<EmailTemplate>('/api/email_templates/templates', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            templateType: data.templateType,
            subjectTemplate: data.subjectTemplate,
            htmlTemplate: data.contentTemplate, // Map contentTemplate (markdown) to htmlTemplate
            isActive: true,
          }),
        })

        if (call.ok && call.result) {
          flash(
            t('email_templates.messages.template_saved', 'Email template saved successfully'),
            'success'
          )
          setEditorDialog(null)
          void loadTemplates()
        } else {
          flash(t('email_templates.errors.save_template', 'Failed to save email template'), 'error')
        }
      } catch (err) {
        console.error('email_templates.template.save failed', err)
        flash(t('email_templates.errors.save_template', 'Failed to save email template'), 'error')
      } finally {
        setSaving(false)
      }
    },
    [t, loadTemplates]
  )

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return
    try {
      const call = await apiCall<{ ok: boolean }>(
        `/api/email_templates/templates/${deleteTarget.templateType}`,
        {
          method: 'DELETE',
        }
      )

      if (call.ok) {
        flash(t('email_templates.messages.template_deleted', 'Template deleted'), 'success')
        setDeleteTarget(null)
        void loadTemplates()
      } else {
        flash(t('email_templates.errors.delete_template', 'Failed to delete template'), 'error')
      }
    } catch (err) {
      console.error('email_templates.template.delete failed', err)
      flash(t('email_templates.errors.delete_template', 'Failed to delete template'), 'error')
    }
  }, [t, loadTemplates, deleteTarget])

  // Get template for a type (or null if not created yet)
  const getTemplateForType = (type: TemplateType): EmailTemplate | null => {
    return templates.find((t) => t.templateType === type) ?? null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'settings' | 'templates')}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="settings">
            {t('email_templates.tabs.settings', 'Email Settings')}
          </TabsTrigger>
          <TabsTrigger value="templates">
            {t('email_templates.tabs.templates', 'Templates')}
          </TabsTrigger>
        </TabsList>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('email_templates.settings.title', 'Email Settings')}</CardTitle>
                  <CardDescription>
                    {t(
                      'email_templates.settings.description',
                      'Configure default email layout and branding'
                    )}
                  </CardDescription>
                </div>
                {brandDefaults && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleApplyBrandDefaults}
                    disabled={saving}
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    {t('email_templates.settings.apply_brand_defaults', 'Apply Brand Defaults')}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">
                    {t('email_templates.settings.branding', 'Branding')}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">
                        {t('email_templates.settings.company_name', 'Company Name')}
                      </Label>
                      <Input
                        id="companyName"
                        value={settings.companyName || ''}
                        onChange={handleSettingsChange('companyName')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyLogoUrl">
                        {t('email_templates.settings.logo_url', 'Logo URL')}
                      </Label>
                      <Input
                        id="companyLogoUrl"
                        type="url"
                        value={settings.companyLogoUrl || ''}
                        onChange={handleSettingsChange('companyLogoUrl')}
                        disabled={saving}
                        placeholder="data:image/... or https://..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">
                        {t('email_templates.settings.primary_color', 'Primary Color')}
                      </Label>
                      <Input
                        id="primaryColor"
                        type="color"
                        value={settings.primaryColor}
                        onChange={handleSettingsChange('primaryColor')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accentColor">
                        {t('email_templates.settings.accent_color', 'Accent Color')}
                      </Label>
                      <Input
                        id="accentColor"
                        type="color"
                        value={settings.accentColor}
                        onChange={handleSettingsChange('accentColor')}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">
                    {t('email_templates.settings.contact_info', 'Contact Information')}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contactEmail">
                        {t('email_templates.settings.contact_email', 'Contact Email')}
                      </Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={settings.contactEmail || ''}
                        onChange={handleSettingsChange('contactEmail')}
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
                        onChange={handleSettingsChange('contactPhone')}
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
                        onChange={handleSettingsChange('websiteUrl')}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>

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
                        onChange={handleSettingsChange('fromName')}
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
                        onChange={handleSettingsChange('fromEmail')}
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
                        onChange={handleSettingsChange('replyToEmail')}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => loadSettings()}
                    disabled={saving}
                  >
                    {t('email_templates.actions.reset', 'Reset')}
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving
                      ? t('email_templates.actions.saving', 'Saving...')
                      : t('email_templates.actions.save', 'Save Settings')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <section className="rounded-lg border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {t('email_templates.templates.title', 'Email Templates')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'email_templates.templates.description',
                    'Manage email templates for different notification types'
                  )}
                </p>
              </div>
              <Button onClick={() => setEditorDialog({ mode: 'create' })}>
                {t('email_templates.actions.create_template', 'Create Template')}
              </Button>
            </div>

            <div className="p-6">
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
                              {t(
                                `email_templates.types.${type}.label`,
                                TEMPLATE_TYPE_LABELS[type]
                              )}
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
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <EmailTemplateEditorDialog
        state={editorDialog}
        onClose={() => setEditorDialog(null)}
        onSave={handleEditorSave}
        saving={saving}
        settings={settings}
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
                  -{' '}
                  {t(
                    `email_templates.types.${previewTarget.templateType}.label`,
                    TEMPLATE_TYPE_LABELS[previewTarget.templateType]
                  )}
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
              {t(
                'email_templates.preview.sample_data_notice',
                'This preview uses sample data'
              )}
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
