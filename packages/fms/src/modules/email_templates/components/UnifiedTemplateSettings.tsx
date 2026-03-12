"use client"

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

import { BrandSettingsTab } from './BrandSettingsTab'
import { EmailSettingsTab } from './EmailSettingsTab'
import { PdfSettingsTab } from './PdfSettingsTab'
import {
  type SharedBrandSettings,
  type BrandDefaults,
  type EmailSpecificSettings,
  DEFAULT_BRAND_SETTINGS,
  DEFAULT_EMAIL_SETTINGS,
  syncBrandSettingsToAll,
  hasBrandCustomizations,
  applyBrandDefaults,
} from '../lib/shared-brand-settings'
import type { TemplateType } from '../lib/template-fields'

type EmailTemplate = {
  templateType: TemplateType
  subjectTemplate: string
  htmlTemplate: string
  isActive: boolean
}

type TabValue = 'brand' | 'email' | 'pdf'

export function UnifiedTemplateSettings() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()

  // Active tab state
  const [activeTab, setActiveTab] = React.useState<TabValue>('brand')

  // Loading/saving states
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  // Settings state
  const [brandSettings, setBrandSettings] = React.useState<SharedBrandSettings>(DEFAULT_BRAND_SETTINGS)
  const [brandDefaults, setBrandDefaults] = React.useState<BrandDefaults | null>(null)
  const [emailSettings, setEmailSettings] = React.useState<EmailSpecificSettings>(DEFAULT_EMAIL_SETTINGS)
  const [emailTemplates, setEmailTemplates] = React.useState<EmailTemplate[]>([])

  // Load all settings from email module
  const loadAll = React.useCallback(async () => {
    setLoading(true)
    try {
      const [emailRes, templatesRes] = await Promise.all([
        apiCall<{
          companyName?: string | null
          companyLogoUrl?: string | null
          primaryColor?: string
          accentColor?: string
          contactEmail?: string | null
          contactPhone?: string | null
          websiteUrl?: string | null
          footerText?: string | null
          footerDisclaimer?: string | null
          fromName?: string | null
          fromEmail?: string | null
          replyToEmail?: string | null
          brandDefaults?: BrandDefaults | null
        }>('/api/email_templates/settings'),
        apiCall<{
          templates: Record<string, EmailTemplate>
          availableTypes: string[]
        }>('/api/email_templates/templates'),
      ])

      const emailData = emailRes.ok ? emailRes.result : null
      const templatesData = templatesRes.ok ? templatesRes.result : null

      // Extract brand defaults
      const defaults = emailData?.brandDefaults ?? null
      setBrandDefaults(defaults)

      // Extract brand settings from email (source of truth)
      const loadedBrand: SharedBrandSettings = {
        companyName: emailData?.companyName ?? null,
        companyLogoUrl: emailData?.companyLogoUrl ?? null,
        primaryColor: emailData?.primaryColor ?? '#1a365d',
        accentColor: emailData?.accentColor ?? '#f7fafc',
      }

      // Auto-populate from brand defaults if no customizations
      if (!hasBrandCustomizations(loadedBrand) && defaults) {
        setBrandSettings(applyBrandDefaults(loadedBrand, defaults))
      } else {
        setBrandSettings(loadedBrand)
      }

      // Extract email-specific settings
      setEmailSettings({
        contactEmail: emailData?.contactEmail ?? null,
        contactPhone: emailData?.contactPhone ?? null,
        websiteUrl: emailData?.websiteUrl ?? null,
        footerText: emailData?.footerText ?? null,
        footerDisclaimer: emailData?.footerDisclaimer ?? null,
        fromName: emailData?.fromName ?? null,
        fromEmail: emailData?.fromEmail ?? null,
        replyToEmail: emailData?.replyToEmail ?? null,
      })

      // Convert templates record to array
      if (templatesData?.templates) {
        const templateList: EmailTemplate[] = Object.entries(templatesData.templates).map(
          ([type, template]) => ({
            templateType: type as TemplateType,
            subjectTemplate: template.subjectTemplate,
            htmlTemplate: template.htmlTemplate,
            isActive: template.isActive,
          })
        )
        setEmailTemplates(templateList)
      }
    } catch (err) {
      console.error('Failed to load template settings:', err)
      flash(t('templates.errors.load_failed', 'Failed to load template settings'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t])

  // Initial load
  React.useEffect(() => {
    void loadAll()
  }, [scopeVersion])

  // Save brand settings
  const handleSaveBrand = React.useCallback(async () => {
    setSaving(true)
    try {
      const result = await syncBrandSettingsToAll(brandSettings)

      if (result.emailOk) {
        flash(
          t('templates.brand.saved', 'Brand settings saved'),
          'success'
        )
      } else {
        flash(
          t('templates.brand.save_failed', 'Failed to save brand settings'),
          'error'
        )
      }
    } catch (err) {
      console.error('Failed to save brand settings:', err)
      flash(t('templates.brand.save_failed', 'Failed to save brand settings'), 'error')
    } finally {
      setSaving(false)
    }
  }, [brandSettings, t])

  // Apply brand defaults
  const handleApplyBrandDefaults = React.useCallback(() => {
    if (!brandDefaults) return
    setBrandSettings(applyBrandDefaults(brandSettings, brandDefaults))
    flash(t('templates.brand.defaults_applied', 'Brand defaults applied'), 'info')
  }, [brandSettings, brandDefaults, t])

  // Save email settings
  const handleSaveEmail = React.useCallback(async () => {
    setSaving(true)
    try {
      const payload = {
        ...brandSettings,
        ...emailSettings,
      }

      const call = await apiCall('/api/email_templates/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (call.ok) {
        flash(
          t('templates.email.saved', 'Email settings saved successfully'),
          'success'
        )
      } else {
        flash(t('templates.email.save_failed', 'Failed to save email settings'), 'error')
      }
    } catch (err) {
      console.error('Failed to save email settings:', err)
      flash(t('templates.email.save_failed', 'Failed to save email settings'), 'error')
    } finally {
      setSaving(false)
    }
  }, [brandSettings, emailSettings, t])

  // Reload templates
  const handleTemplatesChange = React.useCallback(async () => {
    try {
      const call = await apiCall<{
        templates: Record<string, EmailTemplate>
        availableTypes: string[]
      }>('/api/email_templates/templates')

      if (call.ok && call.result?.templates) {
        const templateList: EmailTemplate[] = Object.entries(call.result.templates).map(
          ([type, template]) => ({
            templateType: type as TemplateType,
            subjectTemplate: template.subjectTemplate,
            htmlTemplate: template.htmlTemplate,
            isActive: template.isActive,
          })
        )
        setEmailTemplates(templateList)
      }
    } catch (err) {
      console.error('Failed to reload templates:', err)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('templates.title', 'Template Settings')}</h1>
        <p className="text-muted-foreground mt-1">
          {t(
            'templates.description',
            'Configure branding, email templates, and PDF document settings'
          )}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="brand">
            {t('templates.tabs.brand', 'Brand')}
          </TabsTrigger>
          <TabsTrigger value="email">
            {t('templates.tabs.email', 'Email')}
          </TabsTrigger>
          <TabsTrigger value="pdf">
            {t('templates.tabs.pdf', 'PDF')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brand" className="mt-6">
          <BrandSettingsTab
            settings={brandSettings}
            brandDefaults={brandDefaults}
            saving={saving}
            onChange={setBrandSettings}
            onSave={handleSaveBrand}
            onApplyDefaults={handleApplyBrandDefaults}
          />
        </TabsContent>

        <TabsContent value="email" className="mt-6">
          <EmailSettingsTab
            settings={emailSettings}
            brandSettings={brandSettings}
            templates={emailTemplates}
            saving={saving}
            onChange={setEmailSettings}
            onSave={handleSaveEmail}
            onTemplatesChange={handleTemplatesChange}
          />
        </TabsContent>

        <TabsContent value="pdf" className="mt-6">
          <PdfSettingsTab brandSettings={brandSettings} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
