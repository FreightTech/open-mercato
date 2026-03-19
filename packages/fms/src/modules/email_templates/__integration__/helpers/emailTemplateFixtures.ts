import type { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export type EmailTemplateType =
  | 'offer'
  | 'invoice'
  | 'quote_request'
  | 'shipment_notification'
  | 'booking_confirmation'
  | 'general_message'

export interface EmailTemplateInput {
  templateType: EmailTemplateType
  subjectTemplate: string
  htmlTemplate: string
  isActive?: boolean
}

export interface EmailSettingsInput {
  companyName?: string
  companyLogoUrl?: string
  primaryColor?: string
  accentColor?: string
  contactEmail?: string
  contactPhone?: string
  websiteUrl?: string
  footerText?: string
  footerDisclaimer?: string
  fromName?: string
  fromEmail?: string
  replyToEmail?: string
}

export interface EmailTemplateResponse {
  templateType: string
  subjectTemplate: string
  htmlTemplate: string
  isActive: boolean
}

export interface EmailSettingsResponse extends EmailSettingsInput {
  brandDefaults?: {
    companyName?: string
    companyLogoUrl?: string
    primaryColor?: string
    accentColor?: string
  } | null
}

/**
 * Creates or updates an email template via API.
 */
export async function createEmailTemplateFixture(
  request: APIRequestContext,
  token: string,
  data: EmailTemplateInput
): Promise<EmailTemplateResponse> {
  const response = await request.fetch(`${BASE_URL}/api/email_templates/templates`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })

  if (!response.ok()) {
    const error = await response.text()
    throw new Error(`Failed to create email template: ${response.status()} - ${error}`)
  }

  return response.json()
}

/**
 * Gets an email template by type.
 */
export async function getEmailTemplateFixture(
  request: APIRequestContext,
  token: string,
  templateType: EmailTemplateType
): Promise<EmailTemplateResponse | null> {
  const response = await request.fetch(
    `${BASE_URL}/api/email_templates/templates?type=${templateType}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!response.ok()) {
    return null
  }

  return response.json()
}

/**
 * Lists all email templates.
 */
export async function listEmailTemplatesFixture(
  request: APIRequestContext,
  token: string
): Promise<{
  templates: Record<string, { subjectTemplate: string; htmlTemplate: string; isActive: boolean }>
  availableTypes: string[]
}> {
  const response = await request.fetch(`${BASE_URL}/api/email_templates/templates`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    throw new Error(`Failed to list email templates: ${response.status()}`)
  }

  return response.json()
}

/**
 * Deletes an email template by type. Safe for cleanup - ignores errors.
 */
export async function deleteEmailTemplateIfExists(
  request: APIRequestContext,
  token: string | null,
  templateType: EmailTemplateType
): Promise<void> {
  if (!token) return

  try {
    await request.fetch(`${BASE_URL}/api/email_templates/templates?type=${templateType}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Gets email settings.
 */
export async function getEmailSettingsFixture(
  request: APIRequestContext,
  token: string
): Promise<EmailSettingsResponse> {
  const response = await request.fetch(`${BASE_URL}/api/email_templates/settings`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    throw new Error(`Failed to get email settings: ${response.status()}`)
  }

  return response.json()
}

/**
 * Updates email settings.
 */
export async function updateEmailSettingsFixture(
  request: APIRequestContext,
  token: string,
  data: Partial<EmailSettingsInput>
): Promise<EmailSettingsResponse> {
  const response = await request.fetch(`${BASE_URL}/api/email_templates/settings`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })

  if (!response.ok()) {
    const error = await response.text()
    throw new Error(`Failed to update email settings: ${response.status()} - ${error}`)
  }

  return response.json()
}
