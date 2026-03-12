import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createGooglePlacesService } from '../../../services/google-places.service'

const querySchema = z.object({
  placeId: z.string().min(1, 'Place ID is required'),
  sessionToken: z.string().optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_locations.ports.view'] },
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const rawParams = Object.fromEntries(url.searchParams.entries())

  const parse = querySchema.safeParse(rawParams)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error.issues },
      { status: 400 }
    )
  }

  const placesService = createGooglePlacesService()
  if (!placesService) {
    return NextResponse.json(
      { error: 'Google Places API is not configured', available: false },
      { status: 503 }
    )
  }

  try {
    const details = await placesService.getPlaceDetails(
      parse.data.placeId,
      parse.data.sessionToken
    )

    return NextResponse.json({
      details,
      available: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch place details'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
