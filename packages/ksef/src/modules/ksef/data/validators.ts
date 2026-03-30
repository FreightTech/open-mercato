import { z } from 'zod'

export const ksefSubmissionStatusSchema = z.enum([
  'none', 'queued', 'submitted', 'processing', 'accepted',
  'upo_downloaded', 'rejected', 'error', 'cancelled',
])

export const ksefEnvironmentSchema = z.enum(['test', 'demo', 'production'])

export const ksefAuthTypeSchema = z.enum(['token', 'certificate'])

export const ksefSessionModeSchema = z.enum(['interactive', 'batch'])

export const offlineModeSchema = z.enum(['online', 'offline24', 'unavailability', 'emergency'])

export const submitBatchSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(500),
})

export const syncReceivedSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

export type SubmitBatchDto = z.infer<typeof submitBatchSchema>
export type SyncReceivedDto = z.infer<typeof syncReceivedSchema>
