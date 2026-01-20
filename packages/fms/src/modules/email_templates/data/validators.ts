import { z } from 'zod'

const uuid = () => z.string().uuid()

const scoped = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

export const emailTemplateTypes = [
  'offer',
  'invoice',
  'quote_request',
  'shipment_notification',
  'booking_confirmation',
  'general_message',
] as const

export const emailTemplateTypeSchema = z.enum(emailTemplateTypes)

export const emailTemplateUpsertSchema = scoped.extend({
  templateType: emailTemplateTypeSchema,
  subjectTemplate: z.string().trim().min(1).max(500),
  htmlTemplate: z.string().trim().min(1),
  isActive: z.boolean().optional(),
})

export type EmailTemplateUpsertInput = z.infer<typeof emailTemplateUpsertSchema>

export const emailTemplateListSchema = scoped.extend({
  templateType: emailTemplateTypeSchema.optional(),
  isActive: z.boolean().optional(),
})

export type EmailTemplateListInput = z.infer<typeof emailTemplateListSchema>

// Helper for nullable optional strings that accepts both null and empty string
const nullableString = (maxLength?: number) => 
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.string().max(maxLength || 1000).nullable().optional()
  )

const nullableUrl = () => 
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.string().url().nullable().optional()
  )

const nullableEmail = () => 
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.string().email().nullable().optional()
  )

// Email Settings
export const emailSettingsUpsertSchema = scoped.extend({
  companyName: nullableString(255),
  companyLogoUrl: nullableUrl(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  contactEmail: nullableEmail(),
  contactPhone: nullableString(50),
  websiteUrl: nullableUrl(),
  footerText: nullableString(1000),
  footerDisclaimer: nullableString(1000),
  fromName: nullableString(255),
  fromEmail: nullableEmail(),
  replyToEmail: nullableEmail(),
})

export type EmailSettingsUpsertInput = z.infer<typeof emailSettingsUpsertSchema>

// Template variable validation
export const templateVariablesSchema = z.record(z.string(), z.any())

export type TemplateVariables = z.infer<typeof templateVariablesSchema>
