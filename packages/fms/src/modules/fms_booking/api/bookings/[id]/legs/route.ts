/**
 * FMS Booking Module - Booking Legs API
 * Manage route legs for a booking
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { BookingLeg } from '../../../../data/entities'
import { bookingLegCreateSchema, bookingLegUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_booking.legs.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_booking.legs.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_booking.legs.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_booking.legs.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: BookingLeg,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    populate: ['booking', 'originLocation', 'destinationLocation', 'carrier'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      // Get booking ID from route params
      const bookingId = ctx.params?.id
      if (bookingId) {
        return { booking: bookingId }
      }
      return {}
    },
    sortFieldMap: {
      legSequence: 'leg_sequence',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: bookingLegCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set booking ID from route params
      const bookingId = ctx.params?.id
      if (bookingId) {
        ctx.data.bookingId = bookingId
      }

      // Auto-increment leg sequence if not provided
      if (!ctx.data.legSequence) {
        const existingLegs = await ctx.em.find(BookingLeg, {
          booking: ctx.data.bookingId,
          deletedAt: null,
        })
        ctx.data.legSequence = existingLegs.length + 1
      }
    },
  } as any,
  update: {
    schema: bookingLegUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
