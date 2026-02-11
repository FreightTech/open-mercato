import { z } from 'zod'

// Create Airport schema
export const createAirportSchema = z.object({
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(10, 'Code must be at most 10 characters')
    .regex(/^[A-Z0-9]+$/, 'Code must be uppercase alphanumeric'),
  longCode: z.string().min(1, 'Long code is required').max(255),
  city: z.string().max(100).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  isActive: z.boolean().default(true),
})

export type CreateAirportInput = z.infer<typeof createAirportSchema>

// Update Airport schema
export const updateAirportSchema = createAirportSchema.partial()

export type UpdateAirportInput = z.infer<typeof updateAirportSchema>

// Filter schema for list queries
export const airportFilterSchema = z.object({
  q: z.string().optional(),
  code: z.string().optional(),
  country: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true
      if (val === 'false') return false
      return undefined
    }),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.string().default('code'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})

export type AirportFilter = z.infer<typeof airportFilterSchema>
