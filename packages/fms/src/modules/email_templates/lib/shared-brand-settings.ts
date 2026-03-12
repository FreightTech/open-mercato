/**
 * Shared brand settings types and utilities for the unified Template Settings page.
 * Brand settings are stored in BOTH email_templates and pdf_templates tables
 * and synced on save to maintain backward compatibility.
 */

import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

/**
 * Shared brand fields that are saved to BOTH email and PDF settings tables
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
 * PDF-specific settings (not shared with Email)
 */
export type PdfSpecificSettings = {
  headerHtml: string | null
  footerHtml: string | null
  coverPageImageUrl: string | null
  rulesAgreementHtml: string | null
  showPageNumbers: boolean
  defaultPageSize: 'A4' | 'A3' | 'Letter' | 'Legal'
  defaultPageOrientation: 'portrait' | 'landscape'
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
 * Default values for PDF-specific settings
 */
export const DEFAULT_PDF_SETTINGS: PdfSpecificSettings = {
  headerHtml: null,
  footerHtml: null,
  coverPageImageUrl: null,
  rulesAgreementHtml: null,
  showPageNumbers: true,
  defaultPageSize: 'A4',
  defaultPageOrientation: 'portrait',
}

/**
 * Sync brand settings to both email and PDF modules.
 * This ensures backward compatibility with existing code that reads from either table.
 */
export async function syncBrandSettingsToAll(
  settings: SharedBrandSettings
): Promise<{ emailOk: boolean; pdfOk: boolean }> {
  const [emailRes, pdfRes] = await Promise.all([
    apiCall('/api/email_templates/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
    apiCall('/api/pdf_templates/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  ])

  return {
    emailOk: emailRes.ok,
    pdfOk: pdfRes.ok,
  }
}

/**
 * Load settings from both modules and merge brand settings.
 * Uses email_templates as the source of truth for brand settings.
 */
export async function loadAllTemplateSettings(): Promise<{
  brand: SharedBrandSettings
  brandDefaults: BrandDefaults | null
  email: EmailSpecificSettings
  pdf: PdfSpecificSettings
}> {
  const [emailRes, pdfRes] = await Promise.all([
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
      companyName?: string | null
      companyLogoUrl?: string | null
      primaryColor?: string
      accentColor?: string
      headerHtml?: string | null
      footerHtml?: string | null
      coverPageImageUrl?: string | null
      rulesAgreementHtml?: string | null
      showPageNumbers?: boolean
      defaultPageSize?: string
      defaultPageOrientation?: string
      brandDefaults?: BrandDefaults | null
    }>('/api/pdf_templates/settings'),
  ])

  const emailData = emailRes.ok ? emailRes.result : null
  const pdfData = pdfRes.ok ? pdfRes.result : null

  // Extract brand settings from email (source of truth)
  const brand: SharedBrandSettings = {
    companyName: emailData?.companyName ?? pdfData?.companyName ?? null,
    companyLogoUrl: emailData?.companyLogoUrl ?? pdfData?.companyLogoUrl ?? null,
    primaryColor: emailData?.primaryColor ?? pdfData?.primaryColor ?? '#1a365d',
    accentColor: emailData?.accentColor ?? pdfData?.accentColor ?? '#f7fafc',
  }

  // Get brand defaults (either module should have the same)
  const brandDefaults: BrandDefaults | null = emailData?.brandDefaults ?? pdfData?.brandDefaults ?? null

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

  // Extract PDF-specific settings
  const pdf: PdfSpecificSettings = {
    headerHtml: pdfData?.headerHtml ?? null,
    footerHtml: pdfData?.footerHtml ?? null,
    coverPageImageUrl: pdfData?.coverPageImageUrl ?? null,
    rulesAgreementHtml: pdfData?.rulesAgreementHtml ?? null,
    showPageNumbers: pdfData?.showPageNumbers ?? true,
    defaultPageSize: (pdfData?.defaultPageSize as PdfSpecificSettings['defaultPageSize']) ?? 'A4',
    defaultPageOrientation: (pdfData?.defaultPageOrientation as PdfSpecificSettings['defaultPageOrientation']) ?? 'portrait',
  }

  return { brand, brandDefaults, email, pdf }
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
