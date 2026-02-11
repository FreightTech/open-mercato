import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FrcTruck, FrcTruckBooking } from '../../../../data/entities'
import { resolveWidgetScope } from '../utils'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { FilterQuery } from '@mikro-orm/core'

const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  dateRange: z.enum(['last7', 'last30', 'last90', 'thisMonth', 'thisQuarter']).optional().default('last30'),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'frc_trucks.view'] },
}

function getDateRange(preset: string): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now)
  let start: Date

  switch (preset) {
    case 'last7':
      start = new Date(now)
      start.setDate(start.getDate() - 7)
      break
    case 'last30':
      start = new Date(now)
      start.setDate(start.getDate() - 30)
      break
    case 'last90':
      start = new Date(now)
      start.setDate(start.getDate() - 90)
      break
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'thisQuarter':
      const quarter = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), quarter * 3, 1)
      break
    default:
      start = new Date(now)
      start.setDate(start.getDate() - 30)
  }

  return { start, end }
}

export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  try {
    const url = new URL(req.url)
    const rawQuery: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) rawQuery[key] = value
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
      throw new CrudHttpError(400, { error: translate('frc_trucks.errors.invalid_query', 'Invalid query parameters') })
    }

    const { em, tenantId, organizationIds } = await resolveWidgetScope(req, translate, {
      tenantId: parsed.data.tenantId ?? null,
      organizationId: parsed.data.organizationId ?? null,
    })

    const dateRange = getDateRange(parsed.data.dateRange)

    // Get all active trucks
    const truckWhere: FilterQuery<FrcTruck> = {
      tenantId,
      deletedAt: null,
      isActive: true,
    }
    if (Array.isArray(organizationIds)) {
      truckWhere.organizationId = organizationIds.length === 1 
        ? organizationIds[0] 
        : { $in: Array.from(new Set(organizationIds)) }
    }

    const trucks = await em.find(FrcTruck, truckWhere)

    // Get bookings for these trucks in the date range
    const truckIds = trucks.map(t => t.id)
    const bookingWhere: FilterQuery<FrcTruckBooking> = {
      tenantId,
      deletedAt: null,
      truck: { $in: truckIds },
      date: { $gte: dateRange.start, $lte: dateRange.end },
    }
    if (Array.isArray(organizationIds)) {
      bookingWhere.organizationId = organizationIds.length === 1 
        ? organizationIds[0] 
        : { $in: Array.from(new Set(organizationIds)) }
    }

    const bookings = await em.find(FrcTruckBooking, bookingWhere, {
      populate: ['truck'],
    })

    // Aggregate by truck
    const truckStats = new Map<string, {
      id: string
      name: string
      bookingCount: number
      profitLoss: number
      chargeableWeight: number
    }>()

    // Initialize stats for all trucks
    for (const truck of trucks) {
      truckStats.set(truck.id, {
        id: truck.id,
        name: truck.name,
        bookingCount: 0,
        profitLoss: 0,
        chargeableWeight: 0,
      })
    }

    // Aggregate bookings
    let currencyCode: string | null = null
    for (const booking of bookings) {
      const truckId = booking.truck.id
      const stats = truckStats.get(truckId)
      if (stats) {
        stats.bookingCount++
        
        if (!currencyCode) {
          currencyCode = booking.currencyCode
        }

        if (booking.profitLoss) {
          const pl = parseFloat(String(booking.profitLoss))
          if (!isNaN(pl) && booking.currencyCode === currencyCode) {
            stats.profitLoss += pl
          }
        }

        if (booking.chargeableWeight) {
          const cw = parseFloat(String(booking.chargeableWeight))
          if (!isNaN(cw)) {
            stats.chargeableWeight += cw
          }
        }
      }
    }

    // Convert to array and sort by booking count
    const trucksList = Array.from(truckStats.values())
      .sort((a, b) => b.bookingCount - a.bookingCount)

    // Calculate totals
    let totalBookings = 0
    let totalProfitLoss = 0
    let totalChargeableWeight = 0

    for (const truck of trucksList) {
      totalBookings += truck.bookingCount
      totalProfitLoss += truck.profitLoss
      totalChargeableWeight += truck.chargeableWeight
    }

    return NextResponse.json({
      trucks: trucksList,
      totals: {
        bookings: totalBookings,
        profitLoss: Math.round(totalProfitLoss * 100) / 100,
        chargeableWeight: Math.round(totalChargeableWeight * 100) / 100,
      },
      currencyCode,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('frc_trucks.widgets.utilization failed', err)
    return NextResponse.json(
      { error: translate('frc_trucks.widgets.utilization.error', 'Failed to load truck utilization data') },
      { status: 500 },
    )
  }
}

const utilizationResponseSchema = z.object({
  trucks: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    bookingCount: z.number(),
    profitLoss: z.number(),
    chargeableWeight: z.number(),
  })),
  totals: z.object({
    bookings: z.number(),
    profitLoss: z.number(),
    chargeableWeight: z.number(),
  }),
  currencyCode: z.string().nullable(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Trucks',
  summary: 'Truck utilization widget',
  methods: {
    GET: {
      summary: 'Fetch truck utilization metrics',
      description: 'Returns truck booking counts and profit/loss within the scoped tenant/organization.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Widget payload',
          schema: utilizationResponseSchema,
        },
      ],
      errors: [
        { status: 400, description: 'Invalid query parameters', schema: z.object({ error: z.string() }) },
        { status: 401, description: 'Unauthorized', schema: z.object({ error: z.string() }) },
        { status: 500, description: 'Widget failed to load', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
