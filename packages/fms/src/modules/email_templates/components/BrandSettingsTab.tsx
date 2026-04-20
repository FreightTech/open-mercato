"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import type { SharedBrandSettings } from '../lib/shared-brand-settings'

type BrandSettingsTabProps = {
  settings: SharedBrandSettings
  saving: boolean
  onChange: (settings: SharedBrandSettings) => void
  onSave: () => Promise<void>
}

export function BrandSettingsTab({
  settings,
  saving,
  onChange,
  onSave,
}: BrandSettingsTabProps) {
  const t = useT()

  const handleChange = React.useCallback(
    <K extends keyof SharedBrandSettings>(field: K) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ ...settings, [field]: e.target.value || null })
      },
    [settings, onChange]
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {t('templates.brand.title', 'Brand Settings')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'templates.brand.description',
              'Configure your company branding for all email and PDF templates'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving && <Spinner className="mr-2 h-4 w-4" />}
            {t('templates.brand.save', 'Save Brand Settings')}
          </Button>
        </div>
      </div>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t('templates.brand.company_info', 'Company Information')}</CardTitle>
          <CardDescription>
            {t(
              'templates.brand.company_info_description',
              'Your company name and logo appear in email headers and PDF documents'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">
                {t('templates.brand.company_name', 'Company Name')}
              </Label>
              <Input
                id="companyName"
                value={settings.companyName || ''}
                onChange={handleChange('companyName')}
                placeholder={t('templates.brand.company_name_placeholder', 'Your Company Name')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyLogoUrl">
                {t('templates.brand.logo_url', 'Logo URL')}
              </Label>
              <Input
                id="companyLogoUrl"
                value={settings.companyLogoUrl || ''}
                onChange={handleChange('companyLogoUrl')}
                placeholder={t('templates.brand.logo_url_placeholder', 'https://... or data:image/...')}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'templates.brand.logo_url_hint',
                  'Enter a URL or data URI for your company logo.'
                )}
              </p>
            </div>
          </div>

          {/* Logo Preview */}
          {settings.companyLogoUrl && (
            <div className="space-y-2">
              <Label>{t('templates.brand.logo_preview', 'Logo Preview')}</Label>
              <div className="flex h-16 w-32 items-center justify-center rounded border bg-muted/50">
                <img
                  src={settings.companyLogoUrl}
                  alt="Logo preview"
                  className="max-h-14 max-w-28 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brand Colors */}
      <Card>
        <CardHeader>
          <CardTitle>{t('templates.brand.colors', 'Brand Colors')}</CardTitle>
          <CardDescription>
            {t(
              'templates.brand.colors_description',
              'These colors are used for headers, buttons, and accents in your templates'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">
                {t('templates.brand.primary_color', 'Primary Color')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="primaryColor"
                  type="color"
                  value={settings.primaryColor}
                  onChange={handleChange('primaryColor')}
                  className="h-10 w-14 cursor-pointer p-1"
                />
                <Input
                  value={settings.primaryColor}
                  onChange={handleChange('primaryColor')}
                  placeholder="#1a365d"
                  className="flex-1 font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('templates.brand.primary_color_hint', 'Used for headers, buttons, and links')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accentColor">
                {t('templates.brand.accent_color', 'Accent Color')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="accentColor"
                  type="color"
                  value={settings.accentColor}
                  onChange={handleChange('accentColor')}
                  className="h-10 w-14 cursor-pointer p-1"
                />
                <Input
                  value={settings.accentColor}
                  onChange={handleChange('accentColor')}
                  placeholder="#f7fafc"
                  className="flex-1 font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('templates.brand.accent_color_hint', 'Used for backgrounds and highlights')}
              </p>
            </div>
          </div>

          {/* Color Preview */}
          <div className="space-y-2">
            <Label>{t('templates.brand.color_preview', 'Color Preview')}</Label>
            <div className="flex gap-4">
              <div
                className="flex h-24 w-32 items-center justify-center rounded-lg text-center text-sm font-medium"
                style={{
                  backgroundColor: settings.primaryColor,
                  color: '#ffffff',
                }}
              >
                {t('templates.brand.preview_primary', 'Primary')}
              </div>
              <div
                className="flex h-24 w-32 items-center justify-center rounded-lg border text-center text-sm font-medium"
                style={{
                  backgroundColor: settings.accentColor,
                  color: settings.primaryColor,
                }}
              >
                {t('templates.brand.preview_accent', 'Accent')}
              </div>
              <div
                className="flex h-24 flex-1 items-center justify-center rounded-lg border text-center text-sm"
                style={{
                  backgroundColor: settings.accentColor,
                  borderColor: settings.primaryColor,
                }}
              >
                <span style={{ color: settings.primaryColor }}>
                  {t('templates.brand.preview_combined', 'Combined Preview')}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
