/**
 * FMS Booking Module - Booking Containers API
 * Manage FCL containers for a booking
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { BookingContainer } from '../../../../data/entities'
import { bookingContainerCreateSchema, bookingContainerUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_booking.containers.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_booking.containers.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_booking.containers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_booking.containers.manage'] },
}

export const metadata = routeMetadata

const listSchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: BookingContainer,
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
      containerNumber: 'container_number',
      createdAt: 'created_at',
    },
  } as any,
  create: {
    schema: bookingContainerCreateSchema,
    beforeCreate: async (ctx: any) => {
      // Set booking ID from route params
      const bookingId = ctx.params?.id
      if (bookingId) {
        ctx.data.bookingId = bookingId
      }
    },
  } as any,
  update: {
    schema: bookingContainerUpdateSchema,
  } as any,
  del: {
    softDelete: true,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
