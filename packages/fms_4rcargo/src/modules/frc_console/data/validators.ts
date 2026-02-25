import { z } from 'zod'
import { FRC_CONSOLE_STATUSES } from '../../../lib/types'
import { numericString } from '../../../lib/validators'

export const frcConsoleCreateSchema = z.object({
  date: z.string().or(z.date()),
  truckId: z.string().uuid(),
  originAirportId: z.string().uuid().optional().nullable(),
  destinationAirportId: z.string().uuid().optional().nullable(),
  status: z.enum(FRC_CONSOLE_STATUSES).optional().default('planning'),
  truckPresetId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  customName: z.string().optional().nullable(),
  // Fields from TruckBooking (merged into Console)
  projectAirRoutingId: z.string().uuid().optional().nullable(),
  profitLoss: numericString,
  chargeableWeight: numericString,
  connectionRate: numericString,
  totalTruckCost: numericString,
  currencyCode: z.string().length(3).optional().default('EUR'),
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
  customName: z.string().optional().nullable(),
  // Fields from TruckBooking (merged into Console)
  projectAirRoutingId: z.string().uuid().optional().nullable(),
  profitLoss: numericString,
  chargeableWeight: numericString,
  connectionRate: numericString,
  totalTruckCost: numericString,
  currencyCode: z.string().length(3).optional(),
})

// FrcConsoleCargo validators (replaces FrcConsoleItem)
export const frcConsoleCargoCreateSchema = z.object({
  consoleId: z.string().uuid(),
  airCargoId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
})

export const frcConsoleCargoUpdateSchema = z.object({
  quantity: z.number().int().positive(),
})

export type FrcConsoleCreateInput = z.infer<typeof frcConsoleCreateSchema>
export type FrcConsoleUpdateInput = z.infer<typeof frcConsoleUpdateSchema>
export type FrcConsoleCargoCreateInput = z.infer<typeof frcConsoleCargoCreateSchema>
export type FrcConsoleCargoUpdateInput = z.infer<typeof frcConsoleCargoUpdateSchema>
