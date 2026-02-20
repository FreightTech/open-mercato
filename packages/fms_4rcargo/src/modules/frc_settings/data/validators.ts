import { z } from 'zod'

const uuid = () => z.string().uuid()

const scoped = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

// Offer Template validators
export const offerTemplateCreateSchema = scoped.extend({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  subjectTemplate: z.string().trim().min(1).max(500),
  contentTemplate: z.string().trim().min(1),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export type OfferTemplateCreateInput = z.infer<typeof offerTemplateCreateSchema>

export const offerTemplateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  subjectTemplate: z.string().trim().min(1).max(500).optional(),
  contentTemplate: z.string().trim().min(1).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export type OfferTemplateUpdateInput = z.infer<typeof offerTemplateUpdateSchema>

export const offerTemplateListSchema = scoped.extend({
  isActive: z.boolean().optional(),
})

export type OfferTemplateListInput = z.infer<typeof offerTemplateListSchema>

// SugarCRM Config validators
// Note: Credentials are stored in environment variables (SUGARCRM_INSTANCE_URL, SUGARCRM_USERNAME, SUGARCRM_PASSWORD)
// The database only stores per-tenant sync configuration and status

export const sugarCrmSyncModuleConfigSchema = z.object({
  moduleName: z.string().min(1).max(100),
  enabled: z.boolean(),
  targetEntity: z.string().min(1).max(100),
  fieldMappings: z.record(z.string(), z.string()).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
})

export type SugarCrmSyncModuleConfig = z.infer<typeof sugarCrmSyncModuleConfigSchema>

export const sugarCrmConfigUpsertSchema = scoped.extend({
  syncModules: z.array(sugarCrmSyncModuleConfigSchema).nullable().optional(),
  isEnabled: z.boolean().optional(),
})

export type SugarCrmConfigUpsertInput = z.infer<typeof sugarCrmConfigUpsertSchema>
