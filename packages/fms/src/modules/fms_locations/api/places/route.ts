import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { GooglePlacesService } from '../../services/google-places.service'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_locations.ports.view'] },
}

/**
 * GET /api/fms_locations/places
 *
 * Returns the status of the Google Places API integration
 */
export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const available = GooglePlacesService.isAvailable()

  return NextResponse.json({
    available,
    message: available
      ? 'Google Places API is configured and ready'
      : 'Google Places API is not configured. Set GOOGLE_PLACES_API_KEY environment variable.',
  })
}
