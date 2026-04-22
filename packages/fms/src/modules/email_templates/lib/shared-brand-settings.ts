/**
 * Shared company-branding settings for the unified Template Settings page.
 * These per-tenant settings are stored in the email_templates table and
 * consumed by both email and PDF template renderers.
 */

import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type SharedBrandSettings = {
  companyName: string | null
  companyLogoUrl: string | null
  primaryColor: string
  accentColor: string
}

export type EmailSpecificSettings = {
  contactEmail: string | null
  contactPhone: string | null
  websiteUrl: string | null
  footerText: string | null
  footerDisclaimer: string | null
  fromName: string | null
  fromEmail: string | null
  replyToEmail: string | null
}

export const DEFAULT_BRAND_SETTINGS: SharedBrandSettings = {
  companyName: null,
  companyLogoUrl: null,
  primaryColor: '#1a365d',
  accentColor: '#f7fafc',
}

export const DEFAULT_EMAIL_SETTINGS: EmailSpecificSettings = {
  contactEmail: null,
  contactPhone: null,
  websiteUrl: null,
  footerText: null,
  footerDisclaimer: null,
  fromName: null,
  fromEmail: null,
  replyToEmail: null,
}

export async function syncBrandSettingsToAll(
  settings: SharedBrandSettings
): Promise<{ emailOk: boolean }> {
  const emailRes = await apiCall('/api/email_templates/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })

  return {
    emailOk: emailRes.ok,
  }
}

export async function loadAllTemplateSettings(): Promise<{
  brand: SharedBrandSettings
  email: EmailSpecificSettings
}> {
  const emailRes = await apiCall<{
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
  }>('/api/email_templates/settings')

  const emailData = emailRes.ok ? emailRes.result : null

  const brand: SharedBrandSettings = {
    companyName: emailData?.companyName ?? null,
    companyLogoUrl: emailData?.companyLogoUrl ?? null,
    primaryColor: emailData?.primaryColor ?? '#1a365d',
    accentColor: emailData?.accentColor ?? '#f7fafc',
  }

  const email: EmailSpecificSettings = {
    contactEmail: emailData?.contactEmail ?? null,
    contactPhone: emailData?.contactPhone ?? null,
    websiteUrl: emailData?.websiteUrl ?? null,
    footerText: emailData?.footerText ?? null,
    footerDisclaimer: emailData?.footerDisclaimer ?? null,
    fromName: emailData?.fromName ?? null,
    fromEmail: emailData?.fromEmail ?? null,
    replyToEmail: emailData?.replyToEmail ?? null,
  }

  return { brand, email }
}
