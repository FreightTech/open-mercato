/**
 * FMS Booking Module - Booking Cargo API
 * Manage LCL cargo items for a booking
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { BookingCargo } from '../../../../data/entities'
import { bookingCargoCreateSchema, bookingCargoUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_booking.cargo.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_booking.cargo.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_booking.cargo.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_booking.cargo.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: BookingCargo,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    populate: ['booking'] as any,
    buildFilters: async (_query: any, ctx: any) => {
      // Get booking ID from route params
      const bookingId = ctx.params?.id
      if (bookingId) {
        return { booking: bookingId }
      }
      return {}
    },
    sortFieldMap: {
      cargoSequence: 'cargo_sequence',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: bookingCargoCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set booking ID from route params
      const bookingId = ctx.params?.id
      if (bookingId) {
        ctx.data.bookingId = bookingId
      }

      // Auto-increment cargo sequence if not provided
      if (!ctx.data.cargoSequence) {
        const existingCargo = await ctx.em.find(BookingCargo, {
          booking: ctx.data.bookingId,
          deletedAt: null,
        })
        ctx.data.cargoSequence = existingCargo.length + 1
      }
    },
  } as any,
  update: {
    schema: bookingCargoUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
