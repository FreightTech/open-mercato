import { z } from 'zod'

export const shipmentListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['uploading', 'parsing', 'ready', 'error']).optional(),
  sortField: z.enum(['createdAt', 'status', 'shipperName']).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export const selectHsCodeSchema = z.object({
  hsCode: z.string().min(4).max(10),
  description: z.string().nullable().optional(),
  dutyRate: z.string().nullable().optional(),
  enrich: z.boolean().optional(),
})

export type ShipmentListQuery = z.infer<typeof shipmentListQuerySchema>
export type SelectHsCodeInput = z.infer<typeof selectHsCodeSchema>
