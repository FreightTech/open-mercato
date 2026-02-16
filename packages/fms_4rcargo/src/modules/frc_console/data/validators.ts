import { z } from 'zod'
import { FRC_CONSOLE_STATUSES } from '../../../lib/types'

export const frcConsoleCreateSchema = z.object({
  date: z.string().or(z.date()),
  truckId: z.string().uuid(),
  originAirportId: z.string().uuid().optional().nullable(),
  destinationAirportId: z.string().uuid().optional().nullable(),
  status: z.enum(FRC_CONSOLE_STATUSES).optional().default('planning'),
  truckPresetId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
})

export const frcConsoleUpdateSchema = z.object({
  date: z.string().or(z.date()).optional(),
  truckId: z.string().uuid().optional(),
  originAirportId: z.string().uuid().optional().nullable(),
  destinationAirportId: z.string().uuid().optional().nullable(),
  status: z.enum(FRC_CONSOLE_STATUSES).optional(),
  truckPresetId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
})

export const frcConsoleItemCreateSchema = z.object({
  airCargoId: z.string().uuid(),
  truckBookingId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
})

export const frcConsoleItemUpdateSchema = z.object({
  quantity: z.number().int().positive(),
})

export type FrcConsoleCreateInput = z.infer<typeof frcConsoleCreateSchema>
export type FrcConsoleUpdateInput = z.infer<typeof frcConsoleUpdateSchema>
export type FrcConsoleItemCreateInput = z.infer<typeof frcConsoleItemCreateSchema>
export type FrcConsoleItemUpdateInput = z.infer<typeof frcConsoleItemUpdateSchema>
