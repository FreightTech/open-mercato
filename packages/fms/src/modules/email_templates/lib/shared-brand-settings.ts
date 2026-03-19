/**
 * Shared brand settings types and utilities for the unified Template Settings page.
 * Brand settings are stored in the email_templates table.
 */

import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

/**
 * Shared brand fields that are saved to email settings table
 */
export type SharedBrandSettings = {
  companyName: string | null
  companyLogoUrl: string | null
  primaryColor: string
  accentColor: string
}

/**
 * Brand defaults loaded from the brand registry (via x-brand-id header)
 */
export type BrandDefaults = {
  companyName: string | null
  companyLogoUrl: string | null // data URI
  primaryColor: string
  accentColor: string
}

/**
 * Email-specific settings (not shared with PDF)
 */
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

/**
 * Default values for shared brand settings
 */
export const DEFAULT_BRAND_SETTINGS: SharedBrandSettings = {
  companyName: null,
  companyLogoUrl: null,
  primaryColor: '#1a365d',
  accentColor: '#f7fafc',
}

/**
 * Default values for email-specific settings
 */
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

/**
 * Sync brand settings to email module.
 */
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

/**
 * Load settings from email module.
 */
export async function loadAllTemplateSettings(): Promise<{
  brand: SharedBrandSettings
  brandDefaults: BrandDefaults | null
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
    brandDefaults?: BrandDefaults | null
  }>('/api/email_templates/settings')

  const emailData = emailRes.ok ? emailRes.result : null

  // Extract brand settings from email (source of truth)
  const brand: SharedBrandSettings = {
    companyName: emailData?.companyName ?? null,
    companyLogoUrl: emailData?.companyLogoUrl ?? null,
    primaryColor: emailData?.primaryColor ?? '#1a365d',
    accentColor: emailData?.accentColor ?? '#f7fafc',
  }

  // Get brand defaults
  const brandDefaults: BrandDefaults | null = emailData?.brandDefaults ?? null

  // Extract email-specific settings
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

  return { brand, brandDefaults, email }
}

/**
 * Check if brand settings have been customized (differ from defaults)
 */
export function hasBrandCustomizations(settings: SharedBrandSettings): boolean {
  return !!(
    settings.companyName ||
    settings.companyLogoUrl ||
    (settings.primaryColor && settings.primaryColor !== '#1a365d') ||
    (settings.accentColor && settings.accentColor !== '#f7fafc')
  )
}

/**
 * Apply brand defaults to settings (merge defaults over empty fields)
 */
export function applyBrandDefaults(
  current: SharedBrandSettings,
  defaults: BrandDefaults
): SharedBrandSettings {
  return {
    companyName: defaults.companyName || current.companyName,
    companyLogoUrl: defaults.companyLogoUrl || current.companyLogoUrl,
    primaryColor: defaults.primaryColor || current.primaryColor,
    accentColor: defaults.accentColor || current.accentColor,
  }
}
